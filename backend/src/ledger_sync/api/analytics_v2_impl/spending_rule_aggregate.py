"""Transaction fold for the 50/30/20 spending-rule endpoint.

Turns pre-filtered transaction rows into income/expense totals, per-bucket
totals and per-category rows. See ``spending_rule`` for the bucket semantics
and the reconciliation invariant this fold maintains.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from ledger_sync.api.analytics_v2_impl.spending_rule_classify import (
    _classify_expense,
    _instrument_label,
    _prettify_savings_label,
    _transfer_direction,
)
from ledger_sync.core.expense_class import is_capital_loss
from ledger_sync.core.metric_rules import investment_account_names, is_investment_account
from ledger_sync.db.models import Transaction, TransactionType

_TOP_SUBS_PER_ROW = 3


@dataclass
class _CategoryRow:
    category: str
    bucket: str  # "needs" | "wants" | "savings"
    total_amount: Decimal
    txn_count: int
    # {YYYY-MM: amount}. The keys are the months seen; the amounts let the
    # monthly average leave out the month still in progress.
    month_totals: dict[str, Decimal] = field(default_factory=dict)
    # Subcategory rollup: {sub_label: total_amount}. Used to surface the
    # top-3 subs inline under the category row on the /budgets page so a user
    # with 7 Food & Dining subs still sees the breakdown without cluttering
    # the primary table with 7 separate Food & Dining rows.
    subs: dict[str, Decimal] = field(default_factory=dict)

    def add(self, amount: Decimal, subcategory: str | None, month_key: str) -> None:
        self.total_amount += amount
        self.txn_count += 1
        self.month_totals[month_key] = self.month_totals.get(month_key, Decimal(0)) + amount
        # NULL subcategory rolls up under a synthetic label so the top-subs
        # array can still surface it (e.g. TRANSFER rows always have sub=NULL).
        sub_key = subcategory or "(no subcategory)"
        self.subs[sub_key] = self.subs.get(sub_key, Decimal(0)) + amount

    def to_dict(self, months_in_range: int, in_progress_month: str | None = None) -> dict[str, Any]:
        # Monthly average = complete-month total / complete months in the
        # period (not months-seen), the ``core.calculator.fill_complete_months``
        # rule: a month with no rows counts as 0, otherwise a category with one
        # December bill in a 12-month window looks like a huge monthly outflow.
        # The month still in progress (*in_progress_month*) is left out of both
        # sides; ``total_amount`` still includes it. No complete month -> 0.
        complete_total = self.total_amount
        if in_progress_month is not None:
            complete_total -= self.month_totals.get(in_progress_month, Decimal(0))
        avg_monthly = float(complete_total) / months_in_range if months_in_range > 0 else 0.0
        top_subs = sorted(self.subs.items(), key=lambda kv: kv[1], reverse=True)[:_TOP_SUBS_PER_ROW]
        return {
            "category": self.category,
            # Kept for backward compatibility with the FE type; always None
            # under the new grouping. The real per-sub detail lives in `top_subs`.
            "subcategory": None,
            "bucket": self.bucket,
            "total_amount": float(self.total_amount),
            "avg_monthly": avg_monthly,
            "txn_count": self.txn_count,
            "months_seen": len(self.month_totals),
            "top_subs": [{"name": name, "amount": float(amount)} for name, amount in top_subs],
        }


def _aggregate_txns(
    txns: list[Transaction],
    *,
    essential_set: set[str],
    mapped_investment_accounts: Iterable[str],
    capital_loss_key_set: set[str],
) -> tuple[Decimal, Decimal, dict[str, Decimal], dict[tuple[str, str], _CategoryRow]]:
    """Fold transactions into income/expense totals + per-bucket totals + category rows.

    Extracted from the endpoint handler to keep its cognitive complexity under
    SonarCloud's threshold. See the module docstring for the bucket semantics
    and the reconciliation invariant -- this is a pure aggregation over the
    pre-filtered rows.

    ``bucket_totals`` carries the residual ``unallocated`` alongside the three
    real buckets so callers cannot compute it inconsistently.

    *mapped_investment_accounts* are the raw account names the user mapped as
    investments. They match exactly (case-insensitive); none at all selects the
    default keyword fallback (``core.metric_rules.is_investment_account``).

    *capital_loss_key_set* holds the ``"category::subcategory"`` keys the user
    classified as realised investment losses. Such a row consumed nothing, so it
    is kept out of ``expense_total`` and out of Needs/Wants entirely and only
    shrinks the perimeter. An EMPTY set -- the shipped state -- reproduces the
    pre-preference behaviour exactly, so no user's historical figures move until
    they classify something themselves.
    """
    income_total = Decimal(0)
    expense_total = Decimal(0)
    bucket_totals: dict[str, Decimal] = {
        "needs": Decimal(0),
        "wants": Decimal(0),
        "savings": Decimal(0),
        "unallocated": Decimal(0),
    }
    # Group by (category, bucket). Subcategories roll up under their category
    # row (see _CategoryRow.subs) so the /budgets page shows one row per
    # category with top-3 subs inline -- else a user with 7 Food & Dining
    # subs got 7 separate rows dominating Needs and drowning other categories.
    category_rows: dict[tuple[str, str], _CategoryRow] = {}
    # Mapped accounts match by exact name; the keyword defaults by word boundary.
    perimeter = investment_account_names(mapped_investment_accounts)

    for t in txns:
        amt = t.amount
        month_key = t.date.strftime("%Y-%m")
        inside = is_investment_account(t.account, perimeter)

        if t.type == TransactionType.INCOME:
            income_total += amt
            bucket_totals["savings"] += _book_income_savings(
                category_rows, t, amt, inside=inside, month_key=month_key
            )
            continue

        if t.type == TransactionType.TRANSFER:
            bucket_totals["savings"] += _book_transfer_savings(
                category_rows,
                t,
                amt,
                perimeter=perimeter,
                month_key=month_key,
            )
            continue

        if is_capital_loss(t.category, t.subcategory, capital_loss_key_set):
            bucket_totals["savings"] += _book_capital_loss_savings(
                category_rows, t, amt, inside=inside, month_key=month_key
            )
            continue

        expense_total += amt
        bucket, savings_delta = _book_consumption(
            category_rows,
            t,
            amt,
            inside=inside,
            essential_set=essential_set,
            month_key=month_key,
        )
        bucket_totals[bucket] += amt
        bucket_totals["savings"] += savings_delta

    # Explicit residual: income that was neither spent nor invested. Stays
    # negative when spending + investing outran income -- a real outcome.
    bucket_totals["unallocated"] = (
        income_total - bucket_totals["needs"] - bucket_totals["wants"] - bucket_totals["savings"]
    )

    return income_total, expense_total, bucket_totals, category_rows


def _book_income_savings(
    category_rows: dict[tuple[str, str], _CategoryRow],
    t: Transaction,
    amount: Decimal,
    *,
    inside: bool,
    month_key: str,
) -> Decimal:
    """Savings delta an INCOME row books, writing its instrument row on the way.

    Income credited ON a perimeter account arrived already allocated (EPF
    contribution, RSU vest, reinvested dividend) -- it never crosses the
    perimeter as a TRANSFER, so this is the only place it can register.
    """
    if not inside:
        return Decimal(0)
    _add_savings(category_rows, amount, _instrument_label(t.account), month_key)
    return amount


def _book_transfer_savings(
    category_rows: dict[tuple[str, str], _CategoryRow],
    t: Transaction,
    amount: Decimal,
    *,
    perimeter: frozenset[str],
    month_key: str,
) -> Decimal:
    """Savings delta a TRANSFER row books, writing its relabelled row on the way.

    Direction 0 is internal movement -- the same rupee on both legs. Counting it
    would inflate a bucket against an income denominator that never saw it, so
    such a leg books nothing at all.
    """
    direction = _transfer_direction(t.account or "", t.to_account, perimeter)
    if direction == 0:
        return Decimal(0)
    signed = amount * direction
    display_category, display_sub = _prettify_savings_label(
        t.category, t.subcategory, t.to_account if direction > 0 else t.account
    )
    _upsert_row(category_rows, display_category, "savings", signed, display_sub, month_key)
    return signed


def _book_capital_loss_savings(
    category_rows: dict[tuple[str, str], _CategoryRow],
    t: Transaction,
    amount: Decimal,
    *,
    inside: bool,
    month_key: str,
) -> Decimal:
    """Savings delta a classified realised loss books.

    A realised loss is a negative investment return, not consumption. It never
    reaches expense_total or an expense bucket; the only thing it moves is the
    perimeter, and only when it was booked there.
    """
    if not inside:
        return Decimal(0)
    _add_savings(category_rows, -amount, _instrument_label(t.account), month_key)
    return -amount


def _book_consumption(
    category_rows: dict[tuple[str, str], _CategoryRow],
    t: Transaction,
    amount: Decimal,
    *,
    inside: bool,
    essential_set: set[str],
    month_key: str,
) -> tuple[str, Decimal]:
    """Expense bucket the row lands in, plus the savings delta it books.

    A row booked ON a perimeter account is spending AND money leaving the
    holding: a brokerage fee or realised loss shrinks the perimeter as well as
    being spending. The two entries carry opposite signs, so no rupee is counted
    twice in one direction.
    """
    bucket = _classify_expense(t.category, t.subcategory, essential_set)
    _upsert_row(category_rows, t.category, bucket, amount, t.subcategory, month_key)
    if not inside:
        return bucket, Decimal(0)
    _add_savings(category_rows, -amount, _instrument_label(t.account), month_key)
    return bucket, -amount


def _add_savings(
    category_rows: dict[tuple[str, str], _CategoryRow],
    signed_amount: Decimal,
    label: str,
    month_key: str,
) -> None:
    """Book a perimeter balance change onto the instrument's Savings row.

    Shared by the INCOME-inside and EXPENSE-on-perimeter paths so both group
    under the same instrument label the TRANSFER legs use.
    """
    _upsert_row(category_rows, label, "savings", signed_amount, None, month_key)


def _upsert_row(
    category_rows: dict[tuple[str, str], _CategoryRow],
    category: str,
    bucket: str,
    amount: Decimal,
    subcategory: str | None,
    month_key: str,
) -> None:
    key = (category, bucket)
    row = category_rows.get(key)
    if row is None:
        row = _CategoryRow(
            category=category,
            bucket=bucket,
            total_amount=Decimal(0),
            txn_count=0,
        )
        category_rows[key] = row
    row.add(amount, subcategory, month_key)


def _pct_of_income(amount: Decimal, income_total: Decimal) -> float:
    """Bucket share as a percentage of INCOME -- never of expense.

    Income is the single denominator for all four buckets; that is what makes
    the four shares sum to exactly 100. Dividing a bucket by ``expense_total``
    would produce percentages that reconcile to nothing.
    """
    if income_total <= 0:
        return 0.0
    return float(amount / income_total * 100)

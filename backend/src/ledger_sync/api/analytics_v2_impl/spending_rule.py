"""50/30/20 budget-rule aggregation endpoint.

Returns per-category monthly averages classified into Needs / Wants / Savings
buckets for a user-selected date range, plus header totals and delta-vs-target
scoring. Reads live transactions rather than pre-aggregated rollups because the
bucket classification depends on the current preferences (essential_categories,
investment_account_mappings) and a rollup would drift if a user tunes those.

Bucket rules:

- **Savings**: income / expense / transfer where the target account matches a
  known investment mapping (SIP, MF, PPF, EPF, NPS, Stocks, RD, FD when
  contribution-tagged). Also transfers TO an investment account.
- **Needs**: expense categories that are either in the user's
  ``essential_categories`` preference OR in the built-in Indian defaults
  (Rent, Housing, EMI, Utilities, Groceries, Fuel, Transport, Insurance,
  Healthcare, Education, Family Support, Internet, Phone).
- **Wants**: any expense that is not Needs and not Savings (Dining,
  Entertainment, Shopping, Travel, Subscriptions, etc.).

Income (all rows with type=Income and not from an investment-income category)
is the denominator for the "% of income" scoring. Savings = income - expenses
per the 50/30/20 rule's original framing (Elizabeth Warren, *All Your Worth*),
which treats "savings" as what's left over, not just what you explicitly
transferred to an investment account. The response returns both:

- ``savings_amount``: literal (income - total_expenses) for the header card.
- ``savings_by_category``: category rows for the table -- what you *did* put
  into investment vehicles (SIP, PPF, etc.) so the user can see the breakdown.

These match your ask: header shows the Warren definition, table shows the
account-level breakdown.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import and_, or_

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import (
    Transaction,
    TransactionType,
    UserPreferences,
)

router = APIRouter()


# ─── opinionated Indian defaults ────────────────────────────────────────────

# When the user hasn't tuned `essential_categories`, we ship these as defaults
# for the Needs bucket. Match is case-insensitive and matches on either
# ``category`` or ``subcategory`` -- users label the same concept differently
# ("Rent" vs "Housing/Rent" vs "Home/Rent"). Better to over-match Needs than
# under-match, since the failure mode of a mis-classified expense in Needs
# instead of Wants is a slightly conservative budget score.
_DEFAULT_NEEDS: frozenset[str] = frozenset(
    s.lower()
    for s in (
        "rent",
        "housing",
        "home loan",
        "home-loan",
        "emi",
        "utilities",
        "electricity",
        "water",
        "gas",
        "cooking gas",
        "cylinder",
        "groceries",
        "grocery",
        "food",
        "food & dining",  # user's example includes Food under Needs
        "fuel",
        "petrol",
        "diesel",
        "transport",
        "transportation",
        "commute",
        "insurance",
        "health insurance",
        "life insurance",
        "healthcare",
        "medical",
        "medicine",
        "doctor",
        "hospital",
        "education",
        "school fees",
        "tuition",
        "family support",
        "family",
        "parents",
        "internet",
        "broadband",
        "phone",
        "mobile",
        "recharge",
    )
)

# Display-side rename for Savings-bucket rows whose category is a generic
# "Transfer" bookkeeping label. Users think of these as investments, not
# transfers -- the money went somewhere. Ordered from most specific to most
# generic; the first pattern that matches the ``to_account`` wins.
#
# The DB row is untouched; this only affects what the /budgets page shows.
_TRANSFER_RELABEL_BY_ACCOUNT: tuple[tuple[str, str], ...] = (
    ("ppf", "PPF Contribution"),
    ("epf", "EPF Contribution"),
    ("nps", "NPS Contribution"),
    ("ssy", "Sukanya Samriddhi"),
    ("elss", "ELSS Investment"),
    ("mutual fund", "Mutual Fund Investment"),
    ("mf", "Mutual Fund Investment"),
    ("sip", "SIP Investment"),
    ("stocks", "Stocks Investment"),
    ("equity", "Equity Investment"),
    ("shares", "Stocks Investment"),
    ("groww", "Mutual Fund Investment"),
    ("zerodha", "Stocks Investment"),
    ("kite", "Stocks Investment"),
    ("upstox", "Stocks Investment"),
    ("kuvera", "Mutual Fund Investment"),
    ("coin", "Mutual Fund Investment"),
    ("recurring deposit", "Recurring Deposit"),
    ("rd", "Recurring Deposit"),
    ("fixed deposit", "Fixed Deposit"),
    ("fd", "Fixed Deposit"),
)

# Generic category labels that trigger the rename. If the user's Excel has
# category="Transfer" or subcategory="Transfer to Investment", swap for the
# clearer instrument name based on the destination account.
_GENERIC_TRANSFER_LABELS: frozenset[str] = frozenset(
    s.lower() for s in ("transfer", "transfer out", "transfer to", "movement", "internal transfer")
)


def _prettify_savings_label(
    category: str,
    subcategory: str | None,
    to_account: str | None,
) -> tuple[str, str | None]:
    """Return (category, subcategory) with generic 'Transfer' labels swapped
    for the instrument name inferred from the destination account.

    Only fires for Savings-bucket rows; leaves everything else alone.
    """
    cat_lower = (category or "").lower().strip()
    is_generic = cat_lower in _GENERIC_TRANSFER_LABELS or cat_lower == ""

    if not is_generic or not to_account:
        return category, subcategory

    to_lower = to_account.lower()
    for pattern, pretty in _TRANSFER_RELABEL_BY_ACCOUNT:
        if pattern in to_lower:
            # Keep the original subcategory only if it's not also a generic
            # transfer label -- otherwise the row reads "PPF Contribution /
            # Transfer" which is exactly what we're trying to fix.
            sub_lower = (subcategory or "").lower().strip()
            new_sub = None if sub_lower in _GENERIC_TRANSFER_LABELS else subcategory
            return pretty, new_sub

    # Generic label but destination account didn't match any known instrument
    # -- best effort: relabel as "Investment" so it doesn't say "Transfer".
    return "Investment", subcategory


# Default set of investment-account patterns for the Savings bucket. Matched
# case-insensitively as substrings against the ``account`` / ``to_account``
# field -- e.g. "Groww MF", "HDFC PPF Account", "NPS Tier 1" all match.
_DEFAULT_INVESTMENT_ACCOUNTS: frozenset[str] = frozenset(
    s.lower()
    for s in (
        "sip",
        "mf",
        "mutual fund",
        "ppf",
        "epf",
        "nps",
        "stocks",
        "equity",
        "shares",
        "elss",
        "recurring deposit",
        "rd",
        "sukanya samriddhi",
        "ssy",
        "groww",
        "zerodha",
        "kite",
        "upstox",
        "kuvera",
        "coin",
    )
)


@dataclass
class _CategoryRow:
    category: str
    subcategory: str | None
    bucket: str  # "needs" | "wants" | "savings"
    total_amount: Decimal
    txn_count: int
    months_seen: set[str]  # YYYY-MM keys

    def to_dict(self, months_in_range: int) -> dict[str, Any]:
        # Monthly average is total / months_in_range (the user's period,
        # not the count of months seen) -- otherwise a category that appeared
        # once in a 12-month window looks like a huge monthly bill.
        avg_monthly = float(self.total_amount) / max(months_in_range, 1)
        return {
            "category": self.category,
            "subcategory": self.subcategory,
            "bucket": self.bucket,
            "total_amount": float(self.total_amount),
            "avg_monthly": avg_monthly,
            "txn_count": self.txn_count,
            "months_seen": len(self.months_seen),
        }


def _parse_json_pref(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return fallback


def _months_between(start: datetime, end: datetime) -> int:
    """Inclusive month count between two dates, min 1."""
    months = (end.year - start.year) * 12 + (end.month - start.month) + 1
    return max(months, 1)


def _classify_category(
    category: str,
    subcategory: str | None,
    txn_type: TransactionType,
    account: str,
    to_account: str | None,
    essential_set: set[str],
    investment_accounts_set: set[str],
) -> str:
    """Return one of 'needs', 'wants', 'savings'.

    Only called on expense-side rows for the Needs/Wants split. Savings
    classification is done separately based on the destination account.
    """
    cat_lower = (category or "").lower().strip()
    sub_lower = (subcategory or "").lower().strip()

    # 1. Transfer to an investment account = savings, regardless of category.
    if txn_type == TransactionType.TRANSFER and to_account:
        to_lower = to_account.lower()
        if any(pattern in to_lower for pattern in investment_accounts_set):
            return "savings"

    # 2. Expense on an investment account also counts as savings (SIP debit
    # from bank account with to_account matching a broker/fund).
    if txn_type == TransactionType.EXPENSE and account:
        acc_lower = account.lower()
        if any(pattern in acc_lower for pattern in investment_accounts_set):
            return "savings"

    # 3. Category-based needs classification.
    if cat_lower in essential_set or sub_lower in essential_set:
        return "needs"

    # 4. Everything else = wants (the residual bucket).
    return "wants"


@router.get(
    "/spending-rule",
    responses={422: {"description": "Invalid date range"}},
)
def get_spending_rule_breakdown(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: Annotated[
        datetime | None,
        Query(description="Start of range (inclusive). Defaults to 12 months ago."),
    ] = None,
    end_date: Annotated[
        datetime | None,
        Query(description="End of range (inclusive). Defaults to today."),
    ] = None,
) -> dict[str, Any]:
    """Return the 50/30/20 breakdown + per-category monthly averages.

    Response shape:

        {
          "period": {"start": ISO, "end": ISO, "months": int},
          "income_total": float,
          "expense_total": float,
          "savings_amount": float,  # income - expense (Warren definition)
          "targets": {"needs": 50.0, "wants": 30.0, "savings": 20.0},
          "buckets": {
            "needs":    {"amount": float, "pct_of_income": float, "score_delta": float},
            "wants":    {"amount": float, "pct_of_income": float, "score_delta": float},
            "savings":  {"amount": float, "pct_of_income": float, "score_delta": float},
          },
          "categories": [
            {category, subcategory, bucket, total_amount, avg_monthly, txn_count, months_seen},
            ...
          ]
        }

    `score_delta` is the difference in percentage-points between actual and
    target, signed so positive is "on the right side" for the bucket (under
    for Needs/Wants, over for Savings).
    """
    now = datetime.now(UTC)
    end = end_date or now
    start = start_date or end.replace(year=end.year - 1)
    if start > end:
        # Swap silently -- the frontend can send them either way.
        start, end = end, start
    months_in_range = _months_between(start, end)

    # Preferences -- use user overrides if set, else the opinionated defaults.
    prefs: UserPreferences | None = (
        db.query(UserPreferences).filter(UserPreferences.user_id == current_user.id).one_or_none()
    )
    user_essentials = _parse_json_pref(prefs.essential_categories if prefs else None, [])
    user_inv_mappings = _parse_json_pref(prefs.investment_account_mappings if prefs else None, {})

    essential_set: set[str] = {s.lower() for s in user_essentials if s} or set(_DEFAULT_NEEDS)
    # investment_account_mappings is {"account_pattern": "type"} -- we only
    # need the patterns.
    investment_accounts_set: set[str] = {p.lower() for p in user_inv_mappings.keys() if p} or set(
        _DEFAULT_INVESTMENT_ACCOUNTS
    )

    needs_target = prefs.needs_target_percent if prefs else 50.0
    wants_target = prefs.wants_target_percent if prefs else 30.0
    savings_target = prefs.savings_target_percent if prefs else 20.0

    # ─── query ──────────────────────────────────────────────────────────────
    # Pull every relevant txn in one shot. Volume is bounded by user history +
    # date range; per-user datasets are small enough that a single scan is
    # cheaper than three separate group-by queries.
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.is_deleted.is_(False),
            Transaction.date >= start,
            Transaction.date <= end,
            or_(
                Transaction.type == TransactionType.EXPENSE,
                Transaction.type == TransactionType.INCOME,
                and_(
                    Transaction.type == TransactionType.TRANSFER,
                    Transaction.to_account.isnot(None),
                ),
            ),
        )
        .all()
    )

    # ─── aggregate ──────────────────────────────────────────────────────────
    income_total = Decimal(0)
    expense_total = Decimal(0)
    bucket_totals: dict[str, Decimal] = {
        "needs": Decimal(0),
        "wants": Decimal(0),
        "savings": Decimal(0),
    }
    category_rows: dict[tuple[str, str, str], _CategoryRow] = {}

    for t in txns:
        amt = t.amount
        month_key = t.date.strftime("%Y-%m")

        if t.type == TransactionType.INCOME:
            income_total += amt
            continue  # income doesn't appear in category rows below

        # For EXPENSE + TRANSFER: classify + accumulate.
        bucket = _classify_category(
            category=t.category,
            subcategory=t.subcategory,
            txn_type=t.type,
            account=t.account or "",
            to_account=t.to_account,
            essential_set=essential_set,
            investment_accounts_set=investment_accounts_set,
        )

        # TRANSFER rows that hit "savings" go in the savings bucket total, and
        # TRANSFER rows that don't (wallet-to-wallet moves between two of your
        # own non-investment accounts) are skipped entirely -- they inflate
        # both sides otherwise.
        if t.type == TransactionType.TRANSFER and bucket != "savings":
            continue

        # Expenses always count toward expense_total for the Warren savings calc.
        if t.type == TransactionType.EXPENSE:
            expense_total += amt

        bucket_totals[bucket] += amt

        # Category row aggregation. For Savings-bucket rows whose category
        # is a generic "Transfer" label, prettify the display name from the
        # destination account (PPF/EPF/SIP/etc). Only the display label
        # changes; DB rows and analytics elsewhere are untouched.
        display_category, display_sub = (
            _prettify_savings_label(t.category, t.subcategory, t.to_account)
            if bucket == "savings"
            else (t.category, t.subcategory)
        )
        key = (display_category, display_sub or "", bucket)
        row = category_rows.get(key)
        if row is None:
            row = _CategoryRow(
                category=display_category,
                subcategory=display_sub,
                bucket=bucket,
                total_amount=Decimal(0),
                txn_count=0,
                months_seen=set(),
            )
            category_rows[key] = row
        row.total_amount += amt
        row.txn_count += 1
        row.months_seen.add(month_key)

    # Warren definition of savings for the header card.
    savings_amount = income_total - expense_total

    # ─── shape response ─────────────────────────────────────────────────────
    def _pct_of(x: Decimal) -> float:
        if income_total <= 0:
            return 0.0
        return float(x / income_total * 100)

    needs_pct = _pct_of(bucket_totals["needs"])
    wants_pct = _pct_of(bucket_totals["wants"])
    savings_pct = _pct_of(savings_amount)  # Warren-style, not bucket_totals["savings"]

    # score_delta is signed so positive = on-the-good-side-of-target.
    # For Needs/Wants (caps): positive = under target.
    # For Savings (floor): positive = over target.
    def _delta(actual: float, target: float, kind: str) -> float:
        if kind == "cap":
            return target - actual  # under target -> positive
        return actual - target  # over floor -> positive

    return {
        "period": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "months": months_in_range,
        },
        "income_total": float(income_total),
        "expense_total": float(expense_total),
        "savings_amount": float(savings_amount),
        "targets": {
            "needs": needs_target,
            "wants": wants_target,
            "savings": savings_target,
        },
        "buckets": {
            "needs": {
                "amount": float(bucket_totals["needs"]),
                "pct_of_income": needs_pct,
                "score_delta": _delta(needs_pct, needs_target, "cap"),
            },
            "wants": {
                "amount": float(bucket_totals["wants"]),
                "pct_of_income": wants_pct,
                "score_delta": _delta(wants_pct, wants_target, "cap"),
            },
            "savings": {
                "amount": float(savings_amount),
                "pct_of_income": savings_pct,
                "score_delta": _delta(savings_pct, savings_target, "floor"),
            },
        },
        "categories": sorted(
            (row.to_dict(months_in_range) for row in category_rows.values()),
            key=lambda r: (r["bucket"], -r["total_amount"]),
        ),
    }

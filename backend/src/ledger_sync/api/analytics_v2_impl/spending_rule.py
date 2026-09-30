"""50/30/20 budget-rule aggregation endpoint.

Returns per-category monthly averages classified into Needs / Wants / Savings
buckets for a user-selected date range, plus header totals and delta-vs-target
scoring.

THE INVARIANT: the buckets are shares of one income denominator and they
reconcile to it exactly --

    needs + wants + savings + unallocated == income_total

No expense rupee may land in two expense buckets: Needs and Wants partition
``expense_total`` exactly. ``unallocated`` is the explicit residual (income that
was neither spent nor allocated into an investment), not a fudge factor: the
other three are measured independently and it absorbs the rest.

Only the four-way SUM is bounded by income. Any individual bucket may exceed it
-- a lump sum invested out of savings accumulated earlier pushes ``savings``
past 100% and drives ``unallocated`` negative, exactly as a year of overspending
does. Both are real outcomes and must not be clamped away.

Bucket rules:

- **Needs**: expense categories that are either in the user's
  ``essential_categories`` preference OR in the built-in Indian defaults
  (Rent, Housing, EMI, Utilities, Groceries, Fuel, Transport, Insurance,
  Healthcare, Education, Family Support, Internet, Phone).
- **Wants**: any expense that is not Needs (Dining, Entertainment, Shopping,
  Travel, Subscriptions, etc.). The residual expense bucket.
- **Savings**: the NET CHANGE in the investment-account perimeter (SIP, MF,
  PPF, EPF, NPS, Stocks, RD, FD). Every row that moves the perimeter balance
  moves this bucket by the same signed amount, so the figure is checkable
  against a per-account balance delta.
- **Unallocated**: ``income - needs - wants - savings``.

Transfers are why this needs stating so precisely. A self-transfer writes the
same rupee twice -- once leaving the source account, once arriving at the
destination -- so on the owner's ledger transfers carry 60% of total rupee
volume while representing no income and no expense at all. Four row shapes
move the perimeter balance and therefore the Savings bucket:

- TRANSFER bank -> investment: ``savings += amount`` (a real allocation)
- TRANSFER investment -> bank: ``savings -= amount`` (a redemption, the
  reverse: money coming back out)
- INCOME credited on an investment account: ``savings += amount``. An EPF
  contribution, an RSU vest or a reinvested dividend never crosses the
  perimeter as a TRANSFER -- it lands already allocated. Without this it would
  only inflate the income denominator (239,536 all-time on the owner's ledger)
  and a user whose EPF is their main vehicle would read as saving nothing.
- EXPENSE booked ON an investment account: ``savings -= amount``. A brokerage
  fee or a realised loss is spending (so it also lands in Needs/Wants and in
  ``expense_total``, once each) AND it shrinks the holding. The two entries
  carry opposite signs, which is the flow-of-funds identity, not a
  double-count: the rupee was already deducted from ``unallocated`` when it
  first crossed into the perimeter.

Everything else is skipped: bank -> bank shuffles, card repayments, wallet
top-ups, ledger settlements and investment -> investment reallocations all
keep the same rupee on both legs.

One EXPENSE shape is exempt from the Needs/Wants split entirely: a row whose
taxonomy the user classified as a realised capital loss (``core.expense_class``).
It consumed nothing, so it stays out of ``expense_total`` and out of both expense
buckets and only shrinks the perimeter. The preference ships EMPTY, so this path
is inert until a user classifies something and no historical figure moves on its
own.

This means a contribution only registers as Savings if it is logged as a
TRANSFER into the holding. An EXPENSE row booked on a broker account reads as
money LEAVING that holding, because ``account`` is the account the money left
-- so a SIP logged as an expense lands in Wants and reduces Savings. Log
contributions as TRANSFER rows.

Reads live transactions rather than pre-aggregated rollups because the bucket
classification depends on the current preferences (essential_categories,
investment_account_mappings) and a rollup would drift if a user tunes those.
"""

from __future__ import annotations

import calendar
import json
from datetime import date, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import and_, or_

# Bucket rules and the transaction fold live in sibling modules; the names the
# tests import are re-exported here so this module stays the public entry point.
from ledger_sync.api.analytics_v2_impl.spending_rule_aggregate import (
    _aggregate_txns,
    _pct_of_income,
)
from ledger_sync.api.analytics_v2_impl.spending_rule_aggregate import (
    _CategoryRow as _CategoryRow,
)
from ledger_sync.api.analytics_v2_impl.spending_rule_classify import (
    _DEFAULT_NEEDS,
)
from ledger_sync.api.analytics_v2_impl.spending_rule_classify import (
    _is_transfer_category as _is_transfer_category,
)
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.insight_rules import is_partial_month, month_key
from ledger_sync.core.ledger_clock import ledger_now
from ledger_sync.core.query_helpers import (
    apply_excluded_accounts_filter,
    as_naive,
    capital_loss_keys_for,
    excluded_accounts_for,
    inclusive_end,
    investment_accounts_for,
)
from ledger_sync.db.models import (
    Transaction,
    TransactionType,
    UserPreferences,
)

router = APIRouter()


def _parse_json_pref(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return fallback


def _complete_months_between(start: datetime, end: datetime, today: date) -> int:
    """Complete calendar months from *start* to *end* inclusive.

    The ``core.calculator.fill_complete_months`` rule: every calendar month in
    the range counts, empty ones included, except the month still in progress
    on *today*. 0 when the whole range sits inside that month.
    """
    months = (end.year - start.year) * 12 + (end.month - start.month) + 1
    # (year, month) tuples order exactly as the zero-padded ``month_key`` strings.
    covers_today = (start.year, start.month) <= (today.year, today.month) <= (end.year, end.month)
    if covers_today and is_partial_month(month_key(today), today):
        months -= 1
    return months


def _one_year_before(moment: datetime) -> datetime:
    """Same wall-clock moment a year earlier; 29 Feb falls back to 28 Feb."""
    year = moment.year - 1
    day = min(moment.day, calendar.monthrange(year, moment.month)[1])
    return moment.replace(year=year, day=day)


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
          "period": {"start": ISO, "end": ISO, "months": int},  # complete months
          "income_total": float,
          "expense_total": float,
          "savings_amount": float,  # net change in the investment perimeter
          "unallocated_amount": float,        # additive; the residual
          "unallocated_pct_of_income": float, # additive
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

    The three ``buckets`` percentages plus ``unallocated_pct_of_income`` sum to
    100. ``unallocated_*`` are new keys; every pre-existing key keeps its name
    and type. ``savings_amount`` keeps its name but changes MEANING: it used to
    be (income - expense) and is now the net perimeter change, so any UI label
    reading "income minus expenses" over this number is stale.

    Each individual bucket is bounded only by the four-way sum, NOT by income:
    a period funded from savings accumulated earlier can push ``savings`` past
    100% of that period's income and drive ``unallocated`` negative. That is a
    real outcome, not an error, and it must not be clamped.

    ``period.months`` and each row's ``avg_monthly`` count complete calendar
    months only: empty months count as 0 and the month still in progress on
    the ledger day is left out, while every total and share still includes it.

    `score_delta` is the difference in percentage-points between actual and
    target, signed so positive is "on the right side" for the bucket (under
    for Needs/Wants, over for Savings).
    """
    # Both bounds are normalised to naive before ANY comparison. FastAPI parses
    # a bare `YYYY-MM-DD` to a naive datetime and a `...Z` instant to an aware
    # one, so mixing either with `datetime.now(UTC)` raised
    # `TypeError: can't compare offset-naive and offset-aware datetimes` -- a
    # hard 500 on the `start_date`-only request shape, reproduced 2026-07-27.
    # Naive is the right target: `Transaction.date` carries no zone.
    now = ledger_now()
    end = as_naive(end_date) if end_date else now
    start = as_naive(start_date) if start_date else _one_year_before(end)
    if start > end:
        # Swap silently -- the frontend can send them either way.
        start, end = end, start
    # Averages use complete calendar months only; totals and shares still
    # include the month in progress.
    today = now.date()
    in_progress = month_key(today) if is_partial_month(month_key(today), today) else None
    months_in_range = _complete_months_between(start, end, today)
    # A date-only `end` parses to midnight, which as a `<=` bound would drop
    # that whole day. Kept separate from `end` so `period.end` in the response
    # still echoes the range the caller asked for, not the internal bound.
    end_bound = inclusive_end(end)

    # Preferences -- use user overrides if set, else the opinionated defaults.
    prefs: UserPreferences | None = (
        db.query(UserPreferences).filter(UserPreferences.user_id == current_user.id).one_or_none()
    )
    user_essentials = _parse_json_pref(prefs.essential_categories if prefs else None, [])

    # User overrides ADD to the built-in Indian defaults rather than
    # replacing them. Previously an empty override reverted to defaults,
    # but a user adding "Charity" would silently LOSE all defaults including
    # Education / Housing / Groceries -- a nasty override-drops-defaults foot-gun.
    essential_set: set[str] = set(_DEFAULT_NEEDS) | {s.lower() for s in user_essentials if s}
    # The raw mapped account names, matched exactly; no mapping at all selects
    # the default keyword fallback (``core.metric_rules.is_investment_account``).
    mapped_investment_accounts = investment_accounts_for(current_user)

    needs_target = prefs.needs_target_percent if prefs else 50.0
    wants_target = prefs.wants_target_percent if prefs else 30.0
    # ``savings_target_percent``, NOT ``savings_goal_percent``. This endpoint's
    # savings figure is the net change in the investment perimeter (see
    # ``savings_amount`` below), and that numerator gets the 50/30/20 leg.
    # ``savings_goal_percent`` is the floor for income-minus-expenses and is
    # scored on the Expense Analysis page, the health score, and the Trends goal
    # line. Both columns default to 20.0 while 20% of income allocated into
    # instruments is a far harder bar than 20% left unspent -- on the owner's
    # ledger for FY2025-26 the two numerators are 578,428.79 and 1,182,355.68 --
    # so swapping them silently changes the verdict rather than erroring.
    savings_target = prefs.savings_target_percent if prefs else 20.0

    # ─── query ──────────────────────────────────────────────────────────────
    # Pull every relevant txn in one shot. Volume is bounded by user history +
    # date range; per-user datasets are small enough that a single scan is
    # cheaper than three separate group-by queries.
    # Excluded accounts are dropped here as on every other analytics path.
    txns = apply_excluded_accounts_filter(
        db.query(Transaction).filter(
            Transaction.user_id == current_user.id,
            Transaction.is_deleted.is_(False),
            Transaction.date >= start,
            Transaction.date <= end_bound,
            or_(
                Transaction.type == TransactionType.EXPENSE,
                Transaction.type == TransactionType.INCOME,
                and_(
                    Transaction.type == TransactionType.TRANSFER,
                    Transaction.to_account.isnot(None),
                ),
            ),
        ),
        excluded_accounts_for(current_user),
    ).all()

    income_total, expense_total, bucket_totals, category_rows = _aggregate_txns(
        txns,
        essential_set=essential_set,
        mapped_investment_accounts=mapped_investment_accounts,
        capital_loss_key_set=capital_loss_keys_for(current_user),
    )

    # The header card and the Savings column now report the SAME number: the
    # net change in the investment perimeter. They used to be two different
    # quantities under one label -- the card showed (income - expense) while the
    # table showed gross investment inflow, and on the owner's ledger those
    # differed by 2,624,632 all-time.
    savings_amount = bucket_totals["savings"]

    # ─── shape response ─────────────────────────────────────────────────────
    needs_pct = _pct_of_income(bucket_totals["needs"], income_total)
    wants_pct = _pct_of_income(bucket_totals["wants"], income_total)
    savings_pct = _pct_of_income(savings_amount, income_total)
    unallocated_pct = _pct_of_income(bucket_totals["unallocated"], income_total)

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
        # Additive field (existing keys unchanged). The residual that makes
        # needs + wants + savings + unallocated == income_total hold exactly.
        "unallocated_amount": float(bucket_totals["unallocated"]),
        "unallocated_pct_of_income": unallocated_pct,
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
            (row.to_dict(months_in_range, in_progress) for row in category_rows.values()),
            key=lambda r: (r["bucket"], -r["total_amount"]),
        ),
    }

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

import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import and_, or_

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.expense_class import is_capital_loss
from ledger_sync.core.query_helpers import as_naive, capital_loss_keys_for, inclusive_end
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


# Display-side rename for Savings-bucket rows whose category is a "Transfer:"
# bookkeeping label. Users think of these as investments, not transfers --
# the money went somewhere. Ordered from most specific to most generic; the
# first pattern that matches the ``to_account`` wins.
#
# The DB row is untouched; this only affects what the /budgets page shows.
# Labels are short instrument names (Stocks, Mutual Funds, PPF) so the /budgets
# page rows fit inside the narrow side-by-side columns without truncation.
_MUTUAL_FUNDS_LABEL = "Mutual Funds"

_TRANSFER_RELABEL_BY_ACCOUNT: tuple[tuple[str, str], ...] = (
    # Multi-word patterns first (more specific).
    ("fd/bonds", "FD / Bonds"),
    ("mutual funds", _MUTUAL_FUNDS_LABEL),
    ("mutual fund", _MUTUAL_FUNDS_LABEL),
    ("recurring deposit", "Recurring Deposit"),
    ("fixed deposit", "Fixed Deposit"),
    ("sukanya samriddhi", "Sukanya Samriddhi"),
    # Single-word patterns (matched at word boundaries to avoid substring
    # false positives like "rd" inside "weird" / "board").
    ("ppf", "PPF"),
    ("epf", "EPF"),
    ("nps", "NPS"),
    ("ssy", "Sukanya Samriddhi"),
    ("elss", "ELSS"),
    ("mf", _MUTUAL_FUNDS_LABEL),
    ("sip", "SIP"),
    ("stocks", "Stocks"),
    ("equity", "Stocks"),
    ("shares", "Stocks"),
    ("groww", _MUTUAL_FUNDS_LABEL),
    ("zerodha", "Stocks"),
    ("kite", "Stocks"),
    ("upstox", "Stocks"),
    ("kuvera", _MUTUAL_FUNDS_LABEL),
    ("indmoney", "Stocks"),
    ("coin", _MUTUAL_FUNDS_LABEL),
    ("rd", "Recurring Deposit"),
    ("fd", "Fixed Deposit"),
)


_GENERIC_TRANSFER_LABELS: frozenset[str] = frozenset(
    s.lower() for s in ("transfer", "transfer out", "transfer to", "movement", "internal transfer")
)


def _is_transfer_category(cat_lower: str) -> bool:
    """True if the category is a generic bookkeeping Transfer label.

    Covers both the plain single-word form ('transfer', 'transfer to') AND
    the multi-part 'Transfer: <from> → <to>' pattern that ledger-sync's
    default Excel template uses. Matching by prefix + colon avoids
    accidentally catching a category literally named 'transferable' or a
    user's actual investment category.
    """
    if not cat_lower:
        return True
    if cat_lower in _GENERIC_TRANSFER_LABELS:
        return True
    # "transfer:" (colon suffix) or "transfer: <anything>" -- the ledger-sync
    # Excel template writes rows as "Transfer: Bank: HDFC → Stocks: Groww".
    return cat_lower.startswith("transfer:")


def _match_instrument(account: str | None) -> str | None:
    """Short instrument name for an account, or None if nothing matches.

    Word-boundary match so 'rd' doesn't match 'weird broker' and 'mf' doesn't
    match 'management firm'. Multi-word patterns like 'mutual funds' fit
    \\b...\\b naturally on space boundaries.
    """
    text = (account or "").lower()
    if not text:
        return None
    for pattern, pretty in _TRANSFER_RELABEL_BY_ACCOUNT:
        if re.search(rf"\b{re.escape(pattern)}\b", text):
            return pretty
    return None


def _instrument_label(account: str | None) -> str:
    """Display label for a Savings row derived from an INCOME/EXPENSE row.

    Falls back to the raw account name so a perimeter account the user added
    through ``investment_account_mappings`` still gets a readable row even
    when it matches none of the built-in instrument patterns.
    """
    return _match_instrument(account) or (account or "Investments")


def _prettify_savings_label(
    category: str,
    subcategory: str | None,
    instrument_account: str | None,
) -> tuple[str, str | None]:
    """Return (category, subcategory) with generic 'Transfer' labels swapped
    for the instrument name inferred from the investment side of the leg.

    ``instrument_account`` is the destination for an allocation and the SOURCE
    for a redemption, so both legs of the same holding group under one label
    and the row shows the net.

    Only fires for Savings-bucket rows; leaves everything else alone. Handles
    both the plain 'Transfer' category AND the ledger-sync default template's
    'Transfer: <from> → <to>' compound form.
    """
    cat_lower = (category or "").lower().strip()
    if not _is_transfer_category(cat_lower) or not instrument_account:
        return category, subcategory

    pretty = _match_instrument(instrument_account)
    if pretty is None:
        # Transfer-flavored category but the instrument side didn't match any
        # known pattern (e.g. 'Cashback Shared', 'Security Deposits'). Return
        # the raw category rather than a bogus label -- these get filtered out
        # one step earlier by the internal-movement skip in practice; this is
        # a safety net.
        return category, subcategory

    # Keep the original subcategory only if it's not also a generic transfer
    # label -- otherwise the row reads "PPF / Transfer" which is exactly what
    # we're trying to fix.
    sub_lower = (subcategory or "").lower().strip()
    return pretty, (None if _is_transfer_category(sub_lower) else subcategory)


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


_TOP_SUBS_PER_ROW = 3


@dataclass
class _CategoryRow:
    category: str
    bucket: str  # "needs" | "wants" | "savings"
    total_amount: Decimal
    txn_count: int
    months_seen: set[str] = field(default_factory=set)  # YYYY-MM keys
    # Subcategory rollup: {sub_label: total_amount}. Used to surface the
    # top-3 subs inline under the category row on the /budgets page so a user
    # with 7 Food & Dining subs still sees the breakdown without cluttering
    # the primary table with 7 separate Food & Dining rows.
    subs: dict[str, Decimal] = field(default_factory=dict)

    def add(self, amount: Decimal, subcategory: str | None, month_key: str) -> None:
        self.total_amount += amount
        self.txn_count += 1
        self.months_seen.add(month_key)
        # NULL subcategory rolls up under a synthetic label so the top-subs
        # array can still surface it (e.g. TRANSFER rows always have sub=NULL).
        sub_key = subcategory or "(no subcategory)"
        self.subs[sub_key] = self.subs.get(sub_key, Decimal(0)) + amount

    def to_dict(self, months_in_range: int) -> dict[str, Any]:
        # Monthly average = total / months_in_period (not months-seen) --
        # otherwise a category with one December bill in a 12-month window
        # looks like a huge monthly outflow.
        avg_monthly = float(self.total_amount) / max(months_in_range, 1)
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
            "months_seen": len(self.months_seen),
            "top_subs": [{"name": name, "amount": float(amount)} for name, amount in top_subs],
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


def _matches_investment_pattern(text_lower: str, patterns: set[str]) -> bool:
    """True if any pattern appears at a word boundary in text_lower.

    Word-boundary matching stops short patterns like 'rd' / 'mf' from
    accidentally matching inside 'weird broker' / 'wealth management fund'.
    Multi-word patterns like 'recurring deposit' still match verbatim.
    """
    for pattern in patterns:
        # Escape + wrap in \b. re.search caches the compiled pattern under
        # the hood; per-call cost is negligible given txn volumes.
        if re.search(rf"\b{re.escape(pattern)}\b", text_lower):
            return True
    return False


def _classify_expense(
    category: str,
    subcategory: str | None,
    essential_set: set[str],
) -> str:
    """Return 'needs' or 'wants' for an expense row.

    Purely category-driven. The account the expense was booked on is
    deliberately ignored: a brokerage fee debited on ``Stocks: Groww`` is money
    spent, not money saved, and routing it to Savings on account of where it
    landed counted the same rupee in ``expense_total`` AND in a bucket.

    Word-boundary matching so a category like "Education & Learning" matches
    the singular default keyword "education" -- exact-string matching would
    miss compound labels ("Health & Insurance", "Home Loan / EMI",
    "Food & Dining") which is exactly the shape most Excel templates use.
    """
    cat_lower = (category or "").lower().strip()
    sub_lower = (subcategory or "").lower().strip()

    if _matches_investment_pattern(cat_lower, essential_set):
        return "needs"
    if sub_lower and _matches_investment_pattern(sub_lower, essential_set):
        return "needs"

    # Wants is the residual expense bucket.
    return "wants"


def _transfer_direction(
    account: str,
    to_account: str | None,
    investment_accounts_set: set[str],
) -> int:
    """Signed savings contribution of a transfer: +1 in, -1 out, 0 internal.

    A transfer writes one rupee twice (leaving ``account``, arriving at
    ``to_account``), so only its direction relative to the investment-account
    perimeter carries information:

    - crossing INTO the perimeter is a real allocation (+1)
    - crossing OUT is a redemption -- money coming back, so it must subtract
      (-1), otherwise selling shares registers as "you saved more"
    - staying wholly inside or wholly outside is internal bookkeeping (0):
      bank-to-bank shuffles, card repayments, wallet top-ups, ledger
      settlements, and investment-to-investment reallocations alike
    """
    into = bool(to_account) and _matches_investment_pattern(
        (to_account or "").lower(), investment_accounts_set
    )
    out_of = bool(account) and _matches_investment_pattern(account.lower(), investment_accounts_set)
    if into == out_of:
        return 0
    return 1 if into else -1


def _aggregate_txns(
    txns: list[Transaction],
    *,
    essential_set: set[str],
    investment_accounts_set: set[str],
    capital_loss_key_set: set[str],
) -> tuple[Decimal, Decimal, dict[str, Decimal], dict[tuple[str, str], _CategoryRow]]:
    """Fold transactions into income/expense totals + per-bucket totals + category rows.

    Extracted from the endpoint handler to keep its cognitive complexity under
    SonarCloud's threshold. See the module docstring for the bucket semantics
    and the reconciliation invariant -- this is a pure aggregation over the
    pre-filtered rows.

    ``bucket_totals`` carries the residual ``unallocated`` alongside the three
    real buckets so callers cannot compute it inconsistently.

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

    for t in txns:
        amt = t.amount
        month_key = t.date.strftime("%Y-%m")
        inside = _matches_investment_pattern((t.account or "").lower(), investment_accounts_set)

        if t.type == TransactionType.INCOME:
            income_total += amt
            if inside:
                # Arrived already allocated (EPF contribution, RSU vest,
                # reinvested dividend) -- it never crosses the perimeter as a
                # TRANSFER, so this is the only place it can register.
                _add_savings(category_rows, amt, _instrument_label(t.account), month_key)
                bucket_totals["savings"] += amt
            continue

        if t.type == TransactionType.TRANSFER:
            direction = _transfer_direction(t.account or "", t.to_account, investment_accounts_set)
            if direction == 0:
                # Internal movement -- the same rupee on both legs. Counting it
                # would inflate a bucket against an income denominator that
                # never saw it.
                continue
            signed = amt * direction
            bucket_totals["savings"] += signed
            display_category, display_sub = _prettify_savings_label(
                t.category, t.subcategory, t.to_account if direction > 0 else t.account
            )
            _upsert_row(category_rows, display_category, "savings", signed, display_sub, month_key)
            continue

        if is_capital_loss(t.category, t.subcategory, capital_loss_key_set):
            # A realised loss is a negative investment return, not consumption.
            # It never reaches expense_total or an expense bucket; the only thing
            # it moves is the perimeter, and only when it was booked there.
            if inside:
                _add_savings(category_rows, -amt, _instrument_label(t.account), month_key)
                bucket_totals["savings"] -= amt
            continue

        expense_total += amt
        bucket = _classify_expense(t.category, t.subcategory, essential_set)
        bucket_totals[bucket] += amt
        _upsert_row(category_rows, t.category, bucket, amt, t.subcategory, month_key)
        if inside:
            # Money left the holding: a brokerage fee or realised loss shrinks
            # the perimeter as well as being spending. Opposite signs on the
            # two entries, so no rupee is counted twice in one direction.
            _add_savings(category_rows, -amt, _instrument_label(t.account), month_key)
            bucket_totals["savings"] -= amt

    # Explicit residual: income that was neither spent nor invested. Stays
    # negative when spending + investing outran income -- a real outcome.
    bucket_totals["unallocated"] = (
        income_total - bucket_totals["needs"] - bucket_totals["wants"] - bucket_totals["savings"]
    )

    return income_total, expense_total, bucket_totals, category_rows


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
    now = as_naive(datetime.now(UTC))
    end = as_naive(end_date) if end_date else now
    start = as_naive(start_date) if start_date else end.replace(year=end.year - 1)
    if start > end:
        # Swap silently -- the frontend can send them either way.
        start, end = end, start
    months_in_range = _months_between(start, end)
    # A date-only `end` parses to midnight, which as a `<=` bound would drop
    # that whole day. Kept separate from `end` so `period.end` in the response
    # still echoes the range the caller asked for, not the internal bound.
    end_bound = inclusive_end(end)

    # Preferences -- use user overrides if set, else the opinionated defaults.
    prefs: UserPreferences | None = (
        db.query(UserPreferences).filter(UserPreferences.user_id == current_user.id).one_or_none()
    )
    user_essentials = _parse_json_pref(prefs.essential_categories if prefs else None, [])
    user_inv_mappings = _parse_json_pref(prefs.investment_account_mappings if prefs else None, {})

    # User overrides ADD to the built-in Indian defaults rather than
    # replacing them. Previously an empty override reverted to defaults,
    # but a user adding "Charity" would silently LOSE all defaults including
    # Education / Housing / Groceries -- a nasty override-drops-defaults foot-gun.
    essential_set: set[str] = set(_DEFAULT_NEEDS) | {s.lower() for s in user_essentials if s}
    # investment_account_mappings is {"account_pattern": "type"} -- we only
    # need the patterns.
    investment_accounts_set: set[str] = {p.lower() for p in user_inv_mappings.keys() if p} or set(
        _DEFAULT_INVESTMENT_ACCOUNTS
    )

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
    txns = (
        db.query(Transaction)
        .filter(
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
        )
        .all()
    )

    income_total, expense_total, bucket_totals, category_rows = _aggregate_txns(
        txns,
        essential_set=essential_set,
        investment_accounts_set=investment_accounts_set,
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
            (row.to_dict(months_in_range) for row in category_rows.values()),
            key=lambda r: (r["bucket"], -r["total_amount"]),
        ),
    }

"""recompute the preference-derived splits in rollup rows written under the truthiness bug

Revision ID: rollup_split_backfill_2026
Revises: cashback_key_drift_2026
Create Date: 2026-07-27 11:00:00.000000

``monthly_summaries`` and ``fy_summaries`` PERSIST the preference-derived splits
at build time -- ``essential_expenses`` / ``discretionary_expenses`` and the
salary / bonus / investment / other income split -- and ``/api/analytics/v2/*``
serves the stored columns verbatim. So the accessor fix in
``core/analytics/base.py`` only corrects rollups built AFTER it landed. Rows
written before it keep their corrupted splits until something recomputes them,
and the only triggers are an upload, a rules re-apply, or the manual
``POST /api/analytics/v2/refresh``. A user who imported once and never uploads
again would read the corrupted split forever.

What was corrupted, precisely. The old guard was ``if prefs and prefs.<field>:``
against a ``Text`` column whose model default is the STRING ``"[]"``, which is
truthy, so the documented fallback was dead and the accessor returned the EMPTY
parse. Only rows whose stored value was UNUSABLE (null, blank, malformed, wrong
JSON type, or an empty list) were affected -- a populated list parsed to itself
then and now. Measured over the owner's real ledger, recomputing the split with
empty lists against the shipped defaults:

    essential share of expense        0.00%  ->  70.34%
    salary share of income            0.00%  ->  82.09%
    investment-return share           0.00%  ->   1.53%
    other-income share              100.00%  ->  16.38%

Absolute amounts stay out of tracked source (this repo is public); the
measurements live in the untracked study notes under ``.claude/docs/studies/``.

Why the defaults can be frozen here rather than resolved. For a user whose
stored list was unusable, the post-fix accessor returns exactly the shipped
default; for a user with a real choice it returns that choice, which is what the
old code already did. And an empty list beside a populated sibling resolves to
empty under the group rule -- also what the old code produced. So the ONLY rows
needing repair are the ones where the whole group was unconfigured, and for those
the correct answer is the shipped default set. That is a constant, so this
migration needs no copy of the resolution machinery -- only the constants, and a
test of "was this row ever configured".

The constants below are a deliberate FROZEN copy of
``core/_analytics_helpers.DEFAULT_ESSENTIAL_CATEGORIES``,
``core/analytics/base._INCOME_LIST_DEFAULTS`` and the
``ClassificationMixin`` salary/bonus keywords as they stood at this revision.
Migrations must not import application code: a later migration adding a column
would break a from-scratch replay of this one, and re-pointing it at live
business rules would silently change what an already-applied revision did. If
those defaults change later, that is a NEW migration, not an edit to this one.

Two independent repairs, because the two settings fail independently:

* ``essential_categories`` unusable -> recompute essential/discretionary.
* all four income lists unusable (or exactly their own shipped default, which is
  what ``POST /api/preferences/reset`` persists for the non-taxable one) ->
  recompute the income split.

A user with no ``user_preferences`` row at all is in the victim class for both:
the accessors fall back for a missing row exactly as they do for an empty one.

Gate: a row is only rewritten when the recomputed TOTALS still match the stored
``total_income`` / ``total_expenses``. Totals depend on transaction type and
``excluded_accounts`` alone -- never on the five corrupted lists -- so they match
for exactly the victim class, and a mismatch means the row is additionally stale
for an unrelated reason (deleted or re-imported transactions). Rewriting the
split of such a row would leave the parts disagreeing with the whole; those rows
need a full refresh, which is now correct anyway. On the owner's live ledger this
gate skips 18 of 91 monthly rows and updates 0, because that user configured
their lists years ago -- the repair exists for the unconfigured majority.

Idempotent: the recompute is a pure function of ``transactions`` plus the frozen
defaults, and rows already agreeing are left untouched.

Follows the repo convention of an empty ``downgrade()`` (restore from a database
backup to roll back).
"""

import json
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "rollup_split_backfill_2026"
down_revision: str | None = "cashback_key_drift_2026"
branch_labels: str | None = None
depends_on: str | None = None

# ─── frozen copies of the shipped defaults (see the module docstring) ────────

_DEFAULT_ESSENTIAL_CATEGORIES = frozenset(
    {
        "Housing",
        "Healthcare",
        "Transportation",
        "Food & Dining",
        "Education",
        "Family",
        "Utilities",
    },
)

_CASHBACK = "Refunds & Cashbacks"
_DEFAULT_INCOME_LISTS: dict[str, frozenset[str]] = {
    "taxable_income_categories": frozenset(
        {
            "Employment Income::Salary",
            "Employment Income::Stipend",
            "Employment Income::Bonuses",
            "Employment Income::RSUs",
            "Business/Self Employment Income::Gig Work Income",
        },
    ),
    "investment_returns_categories": frozenset(
        {
            "Investment Income::Dividends",
            "Investment Income::Interest",
            "Investment Income::F&O Income",
            "Investment Income::F&O Profits",
            "Investment Income::Stock Market Profits",
            "Investment Income::Stock Market Profit",
        },
    ),
    "non_taxable_income_categories": frozenset(
        {
            "Refund & Cashbacks::Credit Card Cashbacks",
            "Refund & Cashbacks::Other Cashbacks",
            "Refund & Cashbacks::Product/Service Refunds",
            "Refund & Cashbacks::Deposits Return",
            f"{_CASHBACK}::Credit Card Cashbacks",
            f"{_CASHBACK}::Other Cashbacks",
            f"{_CASHBACK}::Product/Service Refunds",
            f"{_CASHBACK}::Deposit Return",
            "Employment Income::Expense Reimbursement",
        },
    ),
    "other_income_categories": frozenset(
        {
            "One-time Income::Gifts",
            "One-time Income::Pocket Money",
            "One-time Income::Competition/Contest Prizes",
            "Other Income::Gifts",
            "Other Income::Pocket Money",
            "Other Income::Freelance Income",
            "Other Income::Uncategorised",
            "Employment Income::EPF Contribution",
            "Other::Other",
        },
    ),
}

# A salary/bonus item must ALSO be taxable, so these only refine an
# already-taxable item -- they never make something taxable.
_SALARY_KEYWORDS = ("salary", "stipend", "wage", "pension")
_BONUS_KEYWORDS = ("bonus", "rsu", "esop", "incentive", "commission")

_ZERO = Decimal(0)
# Both split columns are Numeric(15, 2), so a difference below a paisa is
# storage rounding rather than a real disagreement.
_TOLERANCE = Decimal("0.01")


# ─── small parsing helpers ──────────────────────────────────────────────────


def _parse_list(raw: object) -> list[str] | None:
    """Return the stored JSON array of strings, or ``None`` when unusable.

    Unusable = NULL, blank, malformed JSON, a non-list JSON value, or an empty
    list. That is exactly the set of stored values the truthiness bug turned
    into an empty result, so ``None`` here means "this row needs repair".
    """
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(parsed, list) or not parsed:
        return None
    return [str(item) for item in parsed if item]


def _as_datetime(value: object) -> datetime | None:
    """Coerce a stored date column to ``datetime``.

    psycopg returns ``datetime`` for a ``DateTime`` column; SQLite hands back the
    raw ``TEXT``. Both shapes reach this migration, so normalise before any
    comparison or month bucketing.
    """
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _money(value: object) -> Decimal:
    """Read a Numeric/float/None column as ``Decimal``, treating NULL as zero."""
    if value is None:
        return _ZERO
    return Decimal(str(value))


def _needs_income_repair(prefs: dict[str, Any] | None) -> bool:
    """True when no income list ever held a user choice.

    A list equal to its OWN shipped default does not count as a choice:
    ``POST /api/preferences/reset`` persists the non-taxable defaults verbatim
    while writing ``"[]"`` for the other three, and treating that as
    configuration would leave a reset user's three empty lists empty -- which is
    the very corruption being repaired.
    """
    if prefs is None:
        return True
    for field, shipped in _DEFAULT_INCOME_LISTS.items():
        stored = _parse_list(prefs.get(field))
        if stored is not None and set(stored) != shipped:
            return False
    return True


# ─── recompute ──────────────────────────────────────────────────────────────


def _new_bucket() -> dict[str, Decimal]:
    return {
        "total_income": _ZERO,
        "salary_income": _ZERO,
        "bonus_income": _ZERO,
        "investment_income": _ZERO,
        "other_income": _ZERO,
        "total_expenses": _ZERO,
        "essential_expenses": _ZERO,
        "discretionary_expenses": _ZERO,
    }


def _accumulate(bucket: dict[str, Decimal], row: sa.Row[Any], amount: Decimal) -> None:
    """Add one transaction to *bucket* using the frozen shipped defaults."""
    if row.type == "INCOME":
        bucket["total_income"] += amount
        item = f"{row.category}::{row.subcategory}"
        subcategory = (row.subcategory or "").lower()
        taxable = item in _DEFAULT_INCOME_LISTS["taxable_income_categories"]
        if taxable and any(kw in subcategory for kw in _SALARY_KEYWORDS):
            bucket["salary_income"] += amount
        elif taxable and any(kw in subcategory for kw in _BONUS_KEYWORDS):
            bucket["bonus_income"] += amount
        elif item in _DEFAULT_INCOME_LISTS["investment_returns_categories"]:
            bucket["investment_income"] += amount
        else:
            bucket["other_income"] += amount
    elif row.type == "EXPENSE":
        bucket["total_expenses"] += amount
        if row.category in _DEFAULT_ESSENTIAL_CATEGORIES:
            bucket["essential_expenses"] += amount
        else:
            bucket["discretionary_expenses"] += amount


def _transactions(bind: sa.Connection, user_id: int, excluded: set[str]) -> list[sa.Row[Any]]:
    """Non-deleted transactions for *user_id*, minus excluded accounts.

    Mirrors ``query_helpers.apply_excluded_accounts_filter``: transfers store
    ``account = from_account``, so all three account columns are checked. Only
    income and expense rows matter here -- every split column this migration
    rewrites is derived from those two types.
    """
    rows = bind.execute(
        sa.text(
            "SELECT date, amount, type, category, subcategory, account, "
            "from_account, to_account FROM transactions "
            "WHERE user_id = :uid AND is_deleted = :deleted "
            "AND type IN ('INCOME', 'EXPENSE')",
        ),
        {"uid": user_id, "deleted": False},
    ).fetchall()
    if not excluded:
        return list(rows)
    return [
        row
        for row in rows
        if row.account not in excluded
        and row.from_account not in excluded
        and row.to_account not in excluded
    ]


def _recompute(
    rows: list[sa.Row[Any]],
    fy_windows: list[tuple[str, datetime, datetime]],
) -> tuple[dict[str, dict[str, Decimal]], dict[str, dict[str, Decimal]]]:
    """Return ``(by_period_key, by_fiscal_year)`` buckets for *rows*.

    Fiscal years are bucketed by each ``fy_summaries`` row's OWN stored
    ``start_date``/``end_date`` rather than by recomputing the FY label, so this
    migration carries no copy of the fiscal-year boundary logic and cannot drift
    from the user's ``fiscal_year_start_month``.
    """
    monthly: dict[str, dict[str, Decimal]] = defaultdict(_new_bucket)
    fiscal: dict[str, dict[str, Decimal]] = defaultdict(_new_bucket)

    for row in rows:
        moment = _as_datetime(row.date)
        if moment is None:
            continue
        amount = _money(row.amount)
        _accumulate(monthly[f"{moment.year:04d}-{moment.month:02d}"], row, amount)
        # Compare CALENDAR DATES, not instants: the engine stores ``end_date`` at
        # midnight of the FY's last day, so an instant comparison drops a
        # transaction timed later that day (verified: a 2026-03-31 23:59 row falls
        # outside the FY2025-26 window the engine itself assigns it to). That
        # would shrink the recomputed total, trip the totals gate, and silently
        # skip the row as stale instead of repairing it.
        moment_day = moment.date()
        for label, start, end in fy_windows:
            if start.date() <= moment_day <= end.date():
                _accumulate(fiscal[label], row, amount)
                break

    return monthly, fiscal


# ─── apply ──────────────────────────────────────────────────────────────────


def _changed(stored: sa.Row[Any], fresh: dict[str, Decimal], columns: list[str]) -> dict[str, str]:
    """Columns of *fresh* that differ from *stored*, as strings for binding."""
    return {
        column: str(fresh[column])
        for column in columns
        if abs(_money(getattr(stored, column)) - fresh[column]) > _TOLERANCE
    }


def _totals_match(stored: sa.Row[Any], fresh: dict[str, Decimal], total_column: str) -> bool:
    return abs(_money(getattr(stored, total_column)) - fresh[total_column]) <= _TOLERANCE


def _repair_monthly(
    bind: sa.Connection,
    user_id: int,
    monthly: dict[str, dict[str, Decimal]],
    *,
    fix_essentials: bool,
    fix_income: bool,
) -> None:
    stored_rows = bind.execute(
        sa.text(
            "SELECT id, period_key, total_income, total_expenses, salary_income, "
            "investment_income, other_income, essential_expenses, "
            "discretionary_expenses FROM monthly_summaries WHERE user_id = :uid",
        ),
        {"uid": user_id},
    ).fetchall()

    for stored in stored_rows:
        fresh = monthly.get(stored.period_key)
        if fresh is None:
            continue

        updates: dict[str, str] = {}
        if fix_essentials and _totals_match(stored, fresh, "total_expenses"):
            updates.update(
                _changed(stored, fresh, ["essential_expenses", "discretionary_expenses"]),
            )
        if fix_income and _totals_match(stored, fresh, "total_income"):
            # MonthlySummary folds bonus into salary: it stores no bonus column,
            # and its salary bucket is `_is_salary_income` only, so a bonus row
            # lands in other_income. FYSummary splits them. Keep both shapes.
            updates.update(
                _changed(
                    stored,
                    {**fresh, "other_income": fresh["other_income"] + fresh["bonus_income"]},
                    ["salary_income", "investment_income", "other_income"],
                ),
            )
        if not updates:
            continue

        assignments = ", ".join(f"{column} = :{column}" for column in updates)
        bind.execute(
            sa.text(f"UPDATE monthly_summaries SET {assignments} WHERE id = :row_id"),
            {**updates, "row_id": stored.id},
        )


def _repair_fiscal(
    bind: sa.Connection,
    fiscal: dict[str, dict[str, Decimal]],
    stored_rows: list[sa.Row[Any]],
) -> None:
    """Repair the FY income splits of *stored_rows*.

    Takes no user id: unlike ``_repair_monthly`` this never queries for its own
    rows, so re-stating the scope the caller already applied to *stored_rows*
    could only drift from it.
    """
    for stored in stored_rows:
        fresh = fiscal.get(stored.fiscal_year)
        if fresh is None or not _totals_match(stored, fresh, "total_income"):
            continue

        updates = _changed(
            stored,
            fresh,
            ["salary_income", "bonus_income", "investment_income", "other_income"],
        )
        if not updates:
            continue

        assignments = ", ".join(f"{column} = :{column}" for column in updates)
        bind.execute(
            sa.text(f"UPDATE fy_summaries SET {assignments} WHERE id = :row_id"),
            {**updates, "row_id": stored.id},
        )


def upgrade() -> None:
    bind = op.get_bind()

    user_ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM users")).fetchall()]
    if not user_ids:
        # Nothing to repair. Checked before the preferences SELECT below, which
        # names columns that only ``create_all()`` ever added -- on a database
        # bootstrapped from migrations alone they do not exist until the
        # reconciliation revision that follows this one.
        return

    prefs_by_user: dict[int, dict[str, Any]] = {
        row["user_id"]: dict(row)
        for row in bind.execute(
            sa.text(
                "SELECT user_id, essential_categories, excluded_accounts, "
                "taxable_income_categories, investment_returns_categories, "
                "non_taxable_income_categories, other_income_categories "
                "FROM user_preferences",
            ),
        ).mappings()
    }

    for user_id in user_ids:
        prefs = prefs_by_user.get(user_id)
        # A missing preferences row falls back exactly like an empty one, so it
        # is in the victim class for both settings.
        fix_essentials = prefs is None or _parse_list(prefs.get("essential_categories")) is None
        fix_income = _needs_income_repair(prefs)
        if not fix_essentials and not fix_income:
            continue

        excluded = set(_parse_list(prefs.get("excluded_accounts")) or []) if prefs else set()

        fy_rows = bind.execute(
            sa.text(
                "SELECT id, fiscal_year, start_date, end_date, total_income, "
                "salary_income, bonus_income, investment_income, other_income "
                "FROM fy_summaries WHERE user_id = :uid",
            ),
            {"uid": user_id},
        ).fetchall()
        fy_windows = [
            (row.fiscal_year, start, end)
            for row in fy_rows
            if (start := _as_datetime(row.start_date)) is not None
            and (end := _as_datetime(row.end_date)) is not None
        ]

        rows = _transactions(bind, user_id, excluded)
        monthly, fiscal = _recompute(rows, fy_windows)

        _repair_monthly(
            bind,
            user_id,
            monthly,
            fix_essentials=fix_essentials,
            fix_income=fix_income,
        )
        if fix_income:
            _repair_fiscal(bind, fiscal, fy_rows)


def downgrade() -> None:
    """No downgrade -- restore from a database backup."""

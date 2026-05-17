"""Helpers for analytics API endpoints (time-range parsing, SQL builders).

Extracted from analytics.py to keep both modules under 500 LOC.
"""

from __future__ import annotations

import calendar
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func
from sqlalchemy.orm import Query as SAQuery
from sqlalchemy.orm import Session

from ledger_sync.core.query_helpers import (
    build_transaction_query,
    expense_sum_col,
    fmt_year_month,
    income_sum_col,
)
from ledger_sync.core.time_filter import TimeRange
from ledger_sync.db.models import Transaction, TransactionType, User


def _subtract_months(dt: datetime, months: int) -> datetime:
    """Subtract N calendar months from a datetime, clamping to valid day."""
    month = dt.month - months
    year = dt.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    # Clamp day to last valid day of target month
    max_day = calendar.monthrange(year, month)[1]
    day = min(dt.day, max_day)
    return dt.replace(year=year, month=month, day=day)


def _get_time_range_dates(
    db: Session,
    user: User,
    time_range: TimeRange,
) -> tuple[datetime | None, datetime | None]:
    """Calculate start/end dates from a TimeRange enum, anchored on ``now()``.

    "This month", "Last 3 months", etc. are computed relative to the current
    UTC time, not the user's most recent transaction. This keeps labels
    honest -- "This Month" always means the current calendar month, even if
    the user hasn't uploaded data in a while (in which case the chart will
    legitimately be empty for that range).

    Sliding windows like "Last 3 months" use calendar-aligned month math
    (subtract N calendar months, snap to the first of the resulting month)
    rather than fixed 90-day windows, so partial-month overlaps don't show
    up in monthly breakdowns.

    Returns (start_date, end_date) or (None, None) for ALL_TIME and for the
    case when the user has no transactions at all (the latter signals "fall
    through to no filter" so callers don't crash on empty data).
    """
    if time_range == TimeRange.ALL_TIME:
        return None, None

    # We still bail out early when the user has no data so the empty-state
    # paths upstream (which check ``if not transactions``) don't try to
    # query a range against an empty table.
    has_any = (
        db.query(Transaction.transaction_id)
        .filter(Transaction.user_id == user.id, Transaction.is_deleted.is_(False))
        .first()
    )
    if not has_any:
        return None, None

    now = datetime.now(UTC)
    end_date: datetime | None = None

    if time_range == TimeRange.THIS_MONTH:
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif time_range == TimeRange.LAST_MONTH:
        first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_end = first_of_month - timedelta(microseconds=1)
        start_date = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = last_month_end
    elif time_range == TimeRange.LAST_3_MONTHS:
        start_date = _subtract_months(
            now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), 2
        )
    elif time_range == TimeRange.LAST_6_MONTHS:
        start_date = _subtract_months(
            now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), 5
        )
    elif time_range == TimeRange.LAST_12_MONTHS:
        start_date = _subtract_months(
            now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), 11
        )
    elif time_range == TimeRange.THIS_YEAR:
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif time_range == TimeRange.LAST_YEAR:
        year = now.year - 1
        start_date = datetime(year, 1, 1, tzinfo=UTC)
        end_date = datetime(year, 12, 31, 23, 59, 59, tzinfo=UTC)
    elif time_range == TimeRange.LAST_DECADE:
        start_date = _subtract_months(
            now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), 119
        )
    else:
        return None, None

    return start_date, end_date


def get_filtered_transactions(
    db: Session,
    user: User,
    time_range: TimeRange = TimeRange.ALL_TIME,
) -> list[Transaction]:
    """Get non-deleted transactions filtered by time range at the DB level."""
    start_date, end_date = _get_time_range_dates(db, user, time_range)
    return list(build_transaction_query(db, user, start_date, end_date).all())


def _build_base_query(
    db: Session,
    user: User,
    time_range: TimeRange,
) -> SAQuery[Transaction]:
    """Build a filtered base query for the given user and time range.

    Returns a SQLAlchemy query on the Transaction table with user_id,
    is_deleted, and date range filters already applied.  Callers add
    their own column expressions / GROUP BY on top of this.
    """
    start_date, end_date = _get_time_range_dates(db, user, time_range)
    return build_transaction_query(db, user, start_date, end_date)


def _get_sql_totals(
    db: Session,
    user: User,
    time_range: TimeRange,
) -> dict[str, float]:
    """Compute total income, expenses, net change, and count in a single SQL query.

    Uses ``func.sum(case(...))`` so the database does all aggregation.
    """
    base = _build_base_query(db, user, time_range).subquery()

    row = db.query(
        income_sum_col(base),
        expense_sum_col(base),
        func.count().label("transaction_count"),
    ).one()

    total_income = float(row.total_income)
    total_expenses = float(row.total_expenses)

    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "net_change": total_income - total_expenses,
        "transaction_count": row.transaction_count,
    }


def _get_sql_monthly_data(
    db: Session,
    user: User,
    time_range: TimeRange,
) -> dict[str, dict[str, float]]:
    """Return monthly income/expenses using SQL GROUP BY.

    Keys are ``"YYYY-MM"`` strings.  Values match the shape returned by
    ``calculator.group_by_month``.
    """
    base = _build_base_query(db, user, time_range).subquery()
    month_col = fmt_year_month(base.c.date).label("month")

    rows = (
        db.query(
            month_col,
            income_sum_col(base, label="income"),
            expense_sum_col(base, label="expenses"),
        )
        .group_by(month_col)
        .all()
    )

    return {
        row.month: {"income": float(row.income), "expenses": float(row.expenses)} for row in rows
    }


def _get_sql_category_totals(
    db: Session,
    user: User,
    time_range: TimeRange,
) -> dict[str, float]:
    """Return expense totals grouped by category using SQL.

    Only ``EXPENSE`` transactions are included, matching the behaviour of
    ``calculator.group_by_category``.
    """
    base = (
        _build_base_query(db, user, time_range)
        .filter(Transaction.type == TransactionType.EXPENSE)
        .subquery()
    )

    rows = (
        db.query(
            base.c.category,
            func.coalesce(func.sum(base.c.amount), 0).label("total"),
        )
        .group_by(base.c.category)
        .all()
    )

    return {row.category: float(row.total) for row in rows}


def _get_sql_account_totals(
    db: Session,
    user: User,
    time_range: TimeRange,
) -> dict[str, float]:
    """Return net account balances using SQL aggregation.

    Income adds to an account, expenses subtract.  Transfers debit the
    source (``from_account``) and credit the destination (``to_account``).
    The result matches ``calculator.group_by_account``.
    """
    base = _build_base_query(db, user, time_range).subquery()

    # Income / Expense rows contribute to the `account` column
    regular_rows = (
        db.query(
            base.c.account.label("account"),
            func.sum(
                case(
                    (base.c.type == TransactionType.INCOME, base.c.amount),
                    (base.c.type == TransactionType.EXPENSE, -base.c.amount),
                    else_=0,
                )
            ).label("net"),
        )
        .filter(base.c.type != TransactionType.TRANSFER)
        .group_by(base.c.account)
        .all()
    )

    account_totals: dict[str, float] = {}
    for row in regular_rows:
        account_totals[row.account] = float(row.net)

    # Transfer debits (from_account)
    transfer_debits = (
        db.query(
            base.c.from_account.label("account"),
            func.sum(base.c.amount).label("total"),
        )
        .filter(
            base.c.type == TransactionType.TRANSFER,
            base.c.from_account.isnot(None),
        )
        .group_by(base.c.from_account)
        .all()
    )
    for row in transfer_debits:
        account_totals[row.account] = account_totals.get(row.account, 0.0) - float(row.total)

    # Transfer credits (to_account)
    transfer_credits = (
        db.query(
            base.c.to_account.label("account"),
            func.sum(base.c.amount).label("total"),
        )
        .filter(
            base.c.type == TransactionType.TRANSFER,
            base.c.to_account.isnot(None),
        )
        .group_by(base.c.to_account)
        .all()
    )
    for row in transfer_credits:
        account_totals[row.account] = account_totals.get(row.account, 0.0) + float(row.total)

    return account_totals

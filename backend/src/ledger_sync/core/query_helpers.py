"""Shared SQL query helpers used by analytics and calculations endpoints.

Centralises duplicated patterns such as income/expense conditional
aggregation columns and the base filtered-transaction query builder.
"""

from datetime import UTC, datetime

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ledger_sync.db.models import Transaction, TransactionType, User

# ---------------------------------------------------------------------------
# Earning-start-date clamping
# ---------------------------------------------------------------------------


def apply_earning_start_date(
    user: User,
    current_start: datetime | None,
) -> datetime | None:
    """Clamp *current_start* to the user's earning-start-date preference.

    If the user has configured an earning start date **and** enabled it,
    the returned start date is never earlier than that date.  Returns
    *current_start* unchanged when the preference is off or absent.
    """
    prefs = user.preferences
    if prefs is None:
        return current_start

    if not prefs.use_earning_start_date or not prefs.earning_start_date:
        return current_start

    try:
        earning_dt = datetime.strptime(
            prefs.earning_start_date, "%Y-%m-%d"
        ).replace(tzinfo=UTC)
    except (ValueError, TypeError):
        return current_start

    if current_start is None:
        return earning_dt
    return max(current_start, earning_dt)


# ---------------------------------------------------------------------------
# Conditional-aggregation column helpers
# ---------------------------------------------------------------------------


def income_sum_col(subquery, *, label: str = "total_income"):
    """Return a ``coalesce(sum(case(...)))`` column for INCOME rows.

    Works with both ``subquery.c`` (aliased sub-select) and model
    attribute access because SQLAlchemy resolves ``.c.type`` /
    ``.c.amount`` in either case.

    Parameters
    ----------
    subquery:
        A SQLAlchemy subquery (the result of ``.subquery()``).
    label:
        SQL label applied to the resulting column expression.
    """
    return func.coalesce(
        func.sum(
            case(
                (subquery.c.type == TransactionType.INCOME, subquery.c.amount),
                else_=0,
            )
        ),
        0,
    ).label(label)


def expense_sum_col(subquery, *, label: str = "total_expenses"):
    """Return a ``coalesce(sum(case(...)))`` column for EXPENSE rows.

    Parameters
    ----------
    subquery:
        A SQLAlchemy subquery (the result of ``.subquery()``).
    label:
        SQL label applied to the resulting column expression.
    """
    return func.coalesce(
        func.sum(
            case(
                (
                    subquery.c.type == TransactionType.EXPENSE,
                    subquery.c.amount,
                ),
                else_=0,
            )
        ),
        0,
    ).label(label)


# ---------------------------------------------------------------------------
# Base transaction query builder
# ---------------------------------------------------------------------------


def build_transaction_query(
    db: Session,
    user: User,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    *,
    apply_earning_start: bool = True,
):
    """Build a filtered ``Transaction`` query for *user*.

    Applies:
    * ``user_id`` filter
    * ``is_deleted = False`` filter
    * Earning-start-date clamping (when *apply_earning_start* is True)
    * Optional *start_date* / *end_date* range filters

    Returns an **un-executed** SQLAlchemy query that callers can further
    refine with extra filters, ``.subquery()``, ``.all()``, etc.
    """
    if apply_earning_start:
        start_date = apply_earning_start_date(user, start_date)

    query = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.is_deleted.is_(False),
    )

    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)

    return query

"""Shared SQL query helpers used by analytics and calculations endpoints.

Centralises duplicated patterns such as income/expense conditional
aggregation columns and the base filtered-transaction query builder.
"""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, case, func, literal, not_
from sqlalchemy.orm import Query, Session
from sqlalchemy.sql.selectable import Subquery

from ledger_sync.config.settings import settings
from ledger_sync.core.expense_class import capital_loss_keys, capital_loss_sql_filter
from ledger_sync.db.models import AccountClassification, Transaction, TransactionType, User

# ---------------------------------------------------------------------------
# Database-agnostic date formatting
# ---------------------------------------------------------------------------

_is_sqlite = "sqlite" in settings.database_url


# ---------------------------------------------------------------------------
# Query-parameter date normalisation
# ---------------------------------------------------------------------------


def as_naive(value: datetime) -> datetime:
    """Drop the tzinfo so a value is comparable with the naive stored column.

    ``Transaction.date`` is a naive ``DateTime`` holding local calendar
    midnights, and FastAPI parses a bare ``YYYY-MM-DD`` query param to a naive
    datetime but ``...Z`` to an aware one. Any handler that compares a
    user-supplied bound against ``datetime.now(UTC)`` therefore raises
    ``TypeError: can't compare offset-naive and offset-aware datetimes`` for one
    of the two input shapes -- a 500, not a 422.

    Normalising to naive (rather than to aware) is what matches the column: the
    stored values have no zone, so attaching one to the bound would shift every
    comparison by the offset.
    """
    return value.replace(tzinfo=None) if value.tzinfo is not None else value


def inclusive_end(end: datetime) -> datetime:
    """Extend a midnight end-bound to cover the whole of that day.

    ``date <= end`` against a date-only bound (parsed to midnight) drops
    same-day rows carrying a time component. A caller who passes an explicit
    time is respected as-is.
    """
    if (end.hour, end.minute, end.second, end.microsecond) == (0, 0, 0, 0):
        return end + timedelta(days=1) - timedelta(microseconds=1)
    return end


def fmt_year_month(date_col: Any) -> Any:
    """Return a SQL expression that formats a date column as 'YYYY-MM'.

    Uses strftime for SQLite, to_char for PostgreSQL.
    """
    if _is_sqlite:
        return func.strftime("%Y-%m", date_col)
    return func.to_char(date_col, "YYYY-MM")


def fmt_year(date_col: Any) -> Any:
    """Return a SQL expression that formats a date column as 'YYYY'."""
    if _is_sqlite:
        return func.strftime("%Y", date_col)
    return func.to_char(date_col, "YYYY")


def fmt_month(date_col: Any) -> Any:
    """Return a SQL expression that formats a date column as 'MM' (zero-padded)."""
    if _is_sqlite:
        return func.strftime("%m", date_col)
    return func.to_char(date_col, "MM")


def fmt_date(date_col: Any) -> Any:
    """Return a SQL expression that formats a date column as 'YYYY-MM-DD'."""
    if _is_sqlite:
        return func.strftime("%Y-%m-%d", date_col)
    return func.to_char(date_col, "YYYY-MM-DD")


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
        earning_dt = datetime.strptime(prefs.earning_start_date, "%Y-%m-%d").replace(tzinfo=UTC)
    except (ValueError, TypeError):
        return current_start

    if current_start is None:
        return earning_dt
    # Ensure both datetimes are comparable (strip tzinfo for comparison)
    naive_earning = earning_dt.replace(tzinfo=None)
    naive_start = current_start.replace(tzinfo=None)
    return current_start if naive_start >= naive_earning else earning_dt


# ---------------------------------------------------------------------------
# Conditional-aggregation column helpers
# ---------------------------------------------------------------------------


def income_sum_col(subquery: Subquery, *, label: str = "total_income") -> Any:
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


def expense_sum_col(
    subquery: Subquery,
    *,
    label: str = "total_expenses",
    loss_keys: set[str] | None = None,
) -> Any:
    """Return a ``coalesce(sum(case(...)))`` column for EXPENSE rows.

    Parameters
    ----------
    subquery:
        A SQLAlchemy subquery (the result of ``.subquery()``).
    label:
        SQL label applied to the resulting column expression.
    loss_keys:
        Normalised ``"category::subcategory"`` keys the user classified as
        realised investment losses (``capital_loss_keys_for``). Rows matching one
        are excluded from the sum: a realised loss is a negative investment
        return, not consumption, so counting it here made the date-filtered
        fallback paths disagree with ``monthly_summaries.total_expenses``, which
        holds it in its own ``capital_losses`` bucket. The exclusion lives in this
        one helper so every ``/totals``, ``/monthly-aggregation`` and yearly
        caller inherits it instead of restating the predicate.

        ``None`` or an empty set emits exactly the SQL this function emitted
        before the parameter existed, which is the state for every user who has
        classified nothing.
    """
    is_expense: Any = subquery.c.type == TransactionType.EXPENSE
    not_a_loss = capital_loss_sql_filter(
        loss_keys or set(),
        subquery.c.category,
        subquery.c.subcategory,
    )
    if not_a_loss is not None:
        is_expense = and_(is_expense, not_a_loss)
    return func.coalesce(
        func.sum(
            case(
                (is_expense, subquery.c.amount),
                else_=0,
            )
        ),
        0,
    ).label(label)


def capital_loss_sum_col(
    subquery: Subquery,
    *,
    label: str = "capital_losses",
    loss_keys: set[str] | None = None,
) -> Any:
    """Return a ``coalesce(sum(case(...)))`` column for classified realised losses.

    The exact complement of ``expense_sum_col``: every EXPENSE row that helper
    drops lands here, so ``income - expenses - capital_losses`` still reconciles
    to the same net figure the un-split query produced. Pair the two whenever a
    response reports both, and emit a constant 0 when nothing is classified so
    the column always exists and callers need no branch.
    """
    not_a_loss = capital_loss_sql_filter(
        loss_keys or set(),
        subquery.c.category,
        subquery.c.subcategory,
    )
    if not_a_loss is None:
        return literal(0).label(label)
    return func.coalesce(
        func.sum(
            case(
                (
                    and_(subquery.c.type == TransactionType.EXPENSE, not_(not_a_loss)),
                    subquery.c.amount,
                ),
                else_=0,
            )
        ),
        0,
    ).label(label)


def capital_loss_keys_for(user: User) -> set[str]:
    """Return the user's ``capital_loss_categories`` preference as normalised keys.

    Lazy-loads ``user.preferences``. Empty when unset, which means "classify
    nothing" and leaves every aggregate behaving as it did before the preference
    existed.
    """
    prefs = user.preferences
    return capital_loss_keys(getattr(prefs, "capital_loss_categories", None) if prefs else None)


# ---------------------------------------------------------------------------
# Base transaction query builder
# ---------------------------------------------------------------------------


def excluded_accounts_for(user: User) -> set[str]:
    """Return the user's ``excluded_accounts`` preference as a set.

    Lazy-loads ``user.preferences``. Returns an empty set when the
    preference is missing or the JSON is malformed -- the analytics
    pipeline treats no-preference as "exclude nothing", and the same
    semantics apply here.
    """
    prefs = user.preferences
    raw = getattr(prefs, "excluded_accounts", None) if prefs else None
    if not raw:
        return set()
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return set()
    if not isinstance(parsed, list):
        return set()
    return {str(a) for a in parsed if a}


def closed_accounts_for(session: Session, user_id: int | None) -> set[str]:
    """Return the names of accounts the user has marked closed.

    Closed accounts keep their history in analytics (unlike
    ``excluded_accounts``) but stop being treated as alive: recurring/bill
    expectations are suppressed and pickers omit them. Consumers that only
    need the forward-looking distinction should use this, not the excluded
    set.
    """
    if user_id is None:
        return set()
    rows = (
        session.query(AccountClassification.account_name)
        .filter(
            AccountClassification.user_id == user_id,
            AccountClassification.is_closed.is_(True),
        )
        .all()
    )
    return {r[0] for r in rows}


def apply_excluded_accounts_filter[QueryT: Query[Any]](query: QueryT, excluded: set[str]) -> QueryT:
    """Drop rows whose ``account``, ``from_account``, or ``to_account`` is excluded.

    Transfers store ``account = from_account``, so a check on ``account``
    alone misses the credit side -- a transfer landing in an excluded
    account would silently leak through. The from/to clauses close that
    gap. ``is_(None)`` keeps plain income/expense rows (which have null
    transfer endpoints) from being dropped. No-op when *excluded* is empty.
    """
    if not excluded:
        return query
    return query.filter(
        Transaction.account.notin_(excluded),
        Transaction.from_account.is_(None) | Transaction.from_account.notin_(excluded),
        Transaction.to_account.is_(None) | Transaction.to_account.notin_(excluded),
    )


def build_transaction_query(
    db: Session,
    user: User,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    *,
    apply_earning_start: bool = False,
    apply_excluded_accounts: bool = True,
) -> Query[Transaction]:
    """Build a filtered ``Transaction`` query for *user*.

    Applies:
    * ``user_id`` filter
    * ``is_deleted = False`` filter
    * Earning-start-date clamping (**opt-in** via *apply_earning_start=True*)
    * Optional *start_date* / *end_date* range filters
    * Excluded-accounts filter (**default on**) -- drops rows whose
      ``account``, ``from_account``, or ``to_account`` matches the
      user's ``excluded_accounts`` preference. Without this, transfers
      landing in an excluded account silently leak through (transfers
      store ``account = from_account``, so a check on ``account`` alone
      misses the credit side). Pass *apply_excluded_accounts=False* to
      get the unfiltered set (e.g. for diagnostic admin tooling).

    Earning-start is a *view* preference (chart x-axis lower bound),
    not a data-boundary. Most callers want factual totals/balances across
    the user's full history and should leave *apply_earning_start* at its
    default of False. Pass True only when you want "show X since I started
    earning" behavior.

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

    if apply_excluded_accounts:
        query = apply_excluded_accounts_filter(query, excluded_accounts_for(user))

    return query

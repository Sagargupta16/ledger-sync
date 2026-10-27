"""Month-to-date sums behind the Dashboard watch tiles.

A watch tile is a saved Transactions view pinned to the Dashboard. The router
narrows the ledger with the filter helpers ``/api/transactions/search`` uses,
so a tile sums exactly the rows its view lists; this module measures that query
on the IST ledger calendar. Month to date runs from day 1 through today. The
comparison is day 1 through the same day of last month, clamped to its length
(31 March compares with 1-28/29 February), never a part month against a whole
one. The trend is the six complete months before this one, oldest first.

A view with a type filter measures that type; one without measures spending
(EXPENSE rows) and reports whether it also lists income or transfer rows, which
its tile then leaves out. Rows are summed as the view lists them: nothing is
reclassified.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import ColumnElement, and_, case, func
from sqlalchemy.orm import Query, Session

from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.core.query_helpers import date_range_criteria, fmt_year_month, inclusive_end
from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.schemas.watch_tiles import WatchMeasure

TREND_MONTHS = 6

_MEASURES: dict[str, WatchMeasure] = {
    "expense": "expense",
    "income": "income",
    "transfer": "transfer",
}


@dataclass(frozen=True, slots=True)
class TilePeriod:
    """The calendar windows one tiles response is computed over."""

    today: date
    month_start: date
    previous_start: date
    previous_end: date
    trend_months: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class TileMetrics:
    """One view's sums over a ``TilePeriod``."""

    month_to_date: float
    previous_same_period: float
    change_pct: float | None
    transaction_count: int
    trend: tuple[tuple[str, float], ...]
    other_types_present: bool


def month_key(day: date) -> str:
    """``YYYY-MM`` for *day*, the format ``fmt_year_month`` produces in SQL."""
    return f"{day.year:04d}-{day.month:02d}"


def first_of_month(anchor: date, offset: int) -> date:
    """The first day of the month *offset* months after *anchor*'s month."""
    index = anchor.year * 12 + anchor.month - 1 + offset
    return date(index // 12, index % 12 + 1, 1)


def midnight(day: date) -> datetime:
    """Naive midnight, comparable with the naive IST ``Transaction.date`` column."""
    return datetime.combine(day, time.min)


def tile_period(today: date | None = None) -> TilePeriod:
    """The windows for *today* (the IST ledger day by default)."""
    today = today or ledger_today()
    month_start = today.replace(day=1)
    previous_start = first_of_month(month_start, -1)
    previous_last_day = (month_start - timedelta(days=1)).day
    return TilePeriod(
        today=today,
        month_start=month_start,
        previous_start=previous_start,
        previous_end=previous_start.replace(day=min(today.day, previous_last_day)),
        trend_months=tuple(
            month_key(first_of_month(month_start, -offset)) for offset in range(TREND_MONTHS, 0, -1)
        ),
    )


def measure_for(type_filter: str | None) -> WatchMeasure:
    """The measure a tile names: its view's type filter, or spending without one.

    A view's own type filter has already narrowed the rows (an unknown type
    empties them, as on the search endpoint). A view without one lists every
    type, and ``tile_metrics(expense_only=True)`` counts its EXPENSE rows.
    """
    if type_filter:
        return _MEASURES.get(type_filter.lower(), "expense")
    return "expense"


def change_pct(current: float, previous: float) -> float | None:
    """Percent change from *previous*; ``None`` when there is nothing to compare with."""
    if previous == 0:
        return None
    return round((current - previous) / abs(previous) * 100, 1)


def tile_metrics(
    db: Session, query: Query[Transaction], period: TilePeriod, *, expense_only: bool
) -> TileMetrics:
    """Month to date, the same days last month and the trend, in one grouped query.

    *query* holds every row the view lists. With *expense_only* (a view without
    a type filter) only its EXPENSE rows are summed and counted, and the other
    rows it lists in these months set ``other_types_present`` instead.
    """
    window_start = midnight(first_of_month(period.month_start, -TREND_MONTHS))
    rows = query.filter(*date_range_criteria(window_start, midnight(period.today))).subquery()
    month_col = fmt_year_month(rows.c.date).label("month")
    # Last month's rows after this cutoff are the rest of that month, not the same days.
    same_days = rows.c.date <= inclusive_end(midnight(period.previous_end))
    amount: ColumnElement[Any]
    if expense_only:
        is_expense = rows.c.type == TransactionType.EXPENSE
        amount = case((is_expense, rows.c.amount))  # NULL for rows the tile leaves out
        early = case((and_(is_expense, same_days), rows.c.amount))
    else:
        amount = rows.c.amount
        early = case((same_days, rows.c.amount))
    result = (
        db.query(
            month_col,
            func.coalesce(func.sum(amount), 0).label("total"),
            func.coalesce(func.sum(early), 0).label("early"),
            func.count(amount).label("row_count"),
            func.count().label("listed"),
        )
        .group_by(month_col)
        .all()
    )
    by_month = {row.month: row for row in result}
    current = by_month.get(month_key(period.month_start))
    previous = by_month.get(month_key(period.previous_start))
    month_to_date = round(float(current.total), 2) if current else 0.0
    previous_same = round(float(previous.early), 2) if previous else 0.0
    return TileMetrics(
        month_to_date=month_to_date,
        previous_same_period=previous_same,
        change_pct=change_pct(month_to_date, previous_same),
        transaction_count=int(current.row_count) if current else 0,
        trend=tuple(
            (month, round(float(by_month[month].total), 2) if month in by_month else 0.0)
            for month in period.trend_months
        ),
        other_types_present=any(row.listed > row.row_count for row in result),
    )

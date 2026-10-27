"""Assemble ``GET /api/saved-views/tiles``: one watch tile per pinned saved view.

Each view's stored filters go through the ``SearchFilters`` model and filter
helpers that ``/api/transactions/search`` uses, on the same
``build_transaction_query`` base (live rows, excluded accounts dropped), so a
tile sums exactly the rows its view lists on the Transactions page.
"""

from __future__ import annotations

from pydantic import ValidationError
from sqlalchemy.orm import Session

from ledger_sync.api.transactions_impl.filters import (
    SearchFilters,
    _apply_search_filters,
    _apply_tag_filter,
)
from ledger_sync.core.query_helpers import build_transaction_query
from ledger_sync.core.watch_tile_pins import list_pins, parse_view_filters
from ledger_sync.core.watch_tile_suggestions import suggested_categories
from ledger_sync.core.watch_tiles import TilePeriod, measure_for, tile_metrics, tile_period
from ledger_sync.db.models import SavedFilterView, SavedViewPin, User
from ledger_sync.schemas.watch_tiles import (
    MAX_PINS,
    WatchPeriod,
    WatchTile,
    WatchTilesResponse,
    WatchTrendPoint,
)

_FILTER_FIELDS = frozenset(SearchFilters.model_fields)

#: Longest text one filter field may hold. Ledger names fit in 255 characters,
#: and stored filters are otherwise unbounded: one huge search pattern made the
#: whole response fail (SQLite: "LIKE or GLOB pattern too complex").
_MAX_FILTER_TEXT = 500


def view_search_filters(raw: str) -> SearchFilters | None:
    """A stored view's filters as ``SearchFilters``; ``None`` when they fail validation.

    Unreadable JSON reads as no filters, which is how ``GET /api/saved-views``
    serves it and so what the page applies. Keys the search endpoint does not
    take are dropped, as are empty values, which the page never sends. Text
    longer than ``_MAX_FILTER_TEXT`` fails, so that tile asks for a check.
    """
    picked = {
        key: value
        for key, value in parse_view_filters(raw).items()
        if key in _FILTER_FIELDS and value not in (None, "")
    }
    if any(isinstance(value, str) and len(value) > _MAX_FILTER_TEXT for value in picked.values()):
        return None
    try:
        return SearchFilters.model_validate(picked)
    except ValidationError:
        return None


def build_tiles(db: Session, user: User) -> WatchTilesResponse:
    """Every pinned view's tile in order; suggestions only while nothing is pinned."""
    period = tile_period()
    tiles = [_tile(db, user, pin, view, period) for pin, view in list_pins(db, user.id)]
    month, suggestions = (None, []) if tiles else suggested_categories(db, user, period)
    return WatchTilesResponse(
        period=WatchPeriod(
            today=period.today.isoformat(),
            month_start=period.month_start.isoformat(),
            previous_start=period.previous_start.isoformat(),
            previous_end=period.previous_end.isoformat(),
            trend_months=list(period.trend_months),
        ),
        tiles=tiles,
        suggestions=suggestions,
        suggestions_month=month,
        max_pins=MAX_PINS,
    )


def _tile(
    db: Session, user: User, pin: SavedViewPin, view: SavedFilterView, period: TilePeriod
) -> WatchTile:
    filters = view_search_filters(view.filters)
    if filters is None:
        return WatchTile(
            view_id=view.id,
            name=view.name,
            position=pin.position,
            measure="expense",
            filters_valid=False,
            has_date_range=False,
            other_types_present=False,
            month_to_date=0,
            previous_same_period=0,
            change_pct=None,
            transaction_count=0,
            trend=[WatchTrendPoint(month=month, amount=0) for month in period.trend_months],
        )
    query = _apply_search_filters(build_transaction_query(db, user), filters)
    query = _apply_tag_filter(query, user.id, filters.tag)
    metrics = tile_metrics(db, query, period, expense_only=not filters.type)
    return WatchTile(
        view_id=view.id,
        name=view.name,
        position=pin.position,
        measure=measure_for(filters.type),
        filters_valid=True,
        has_date_range=filters.start_date is not None or filters.end_date is not None,
        other_types_present=metrics.other_types_present,
        month_to_date=metrics.month_to_date,
        previous_same_period=metrics.previous_same_period,
        change_pct=metrics.change_pct,
        transaction_count=metrics.transaction_count,
        trend=[WatchTrendPoint(month=month, amount=amount) for month, amount in metrics.trend],
    )

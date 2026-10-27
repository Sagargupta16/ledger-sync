"""Build the lot ledger, Schedule FA worksheet and FAST-DS valuation from one user's records.

A computation aid, not tax advice. Each report runs in two steps: ``*_starts``
names the stocks it needs prices for and where each history starts, the caller
loads that market data with no database session open, then the report itself
is pure computation over the records and the market data.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from ledger_sync.core.foreign_assets import RsuTaxRuleError
from ledger_sync.core.foreign_assets_fast_ds import DEADLINE, VALUATION_DATE, fast_ds
from ledger_sync.core.foreign_assets_lots import Lot, build_lots
from ledger_sync.core.foreign_assets_market import MarketData
from ledger_sync.core.foreign_assets_notes import (
    indian_note,
    lot_notes,
    uncounted_notes,
)
from ledger_sync.core.foreign_assets_records import EventRecord, Holdings
from ledger_sync.core.foreign_assets_responses import (
    ds_row,
    event_response,
    fa_row,
    fa_totals,
    lot_response,
)
from ledger_sync.core.foreign_assets_schedule import Period, schedule_fa
from ledger_sync.schemas.rsu_tax import EventIssue
from ledger_sync.schemas.rsu_tax_reports import (
    FastDsResponse,
    FastDsRowResponse,
    LotLedgerResponse,
    ScheduleFaResponse,
    ScheduleFaRowResponse,
)

RATE_BASIS = "ECB reference rate of the day, an approximation of the SBI TT buying rate"


def return_label(year: int) -> str:
    if year <= 2025:
        return (
            f"AY {year + 1}-{(year + 2) % 100:02d} ITR-2 Schedule FA, calendar year "
            f"1 Jan to 31 Dec {year} (Income-tax Act 1961)"
        )
    return (
        f"Calendar year {year}. The tax year {year}-{(year + 1) % 100:02d} return under the "
        "Income-tax Act 2025 is not published, so its reporting window is unconfirmed"
    )


def _lots(holdings: Holdings, market: MarketData, as_of: date) -> list[Lot]:
    return build_lots(
        holdings.vests,
        holdings.fx,
        holdings.sales,
        as_of,
        splits_by_symbol=market.splits(),
        prices_in_inr=holdings.prices_in_inr,
    )


def _by_currency(lots: Sequence[Lot], market: MarketData) -> tuple[dict[str, list[Lot]], set[str]]:
    """Lots by quote currency, and the rupee-quoted (Indian, not foreign) stocks left out."""
    groups: dict[str, list[Lot]] = {}
    for lot in lots:
        groups.setdefault(market.currency(lot.vest.symbol), []).append(lot)
    return groups, {lot.vest.symbol for lot in groups.pop("INR", [])}


def ledger_starts(holdings: Holdings, today: date) -> dict[str, date]:
    return holdings.first_vests(today)


def _issue(event: EventRecord, lots: Sequence[Lot], market: MarketData) -> EventIssue | None:
    found = market.history.get(event.symbol)
    if found is not None and found.currency == "INR":
        return "indian_stock"
    if event.kind == "sale":
        lot = next((lot for lot in lots if lot.lot_id == event.lot_id), None)
        if lot is None:
            return "unlinked"
        return "before_vest" if event.day < lot.acquired_on else None
    holders = [lot for lot in lots if lot.vest.symbol == event.symbol]
    if not holders:
        return "unknown_stock"
    held = any(lot.vest_shares_before(event.day) > 0 for lot in holders)
    return None if held else "no_shares_held"


def lot_ledger(holdings: Holdings, market: MarketData, today: date) -> LotLedgerResponse:
    """One lot per vest that has happened, with the user's sales and dividends."""
    lots = _lots(holdings, market, today)

    def currency(symbol: str) -> str | None:
        found = market.history.get(symbol)
        return found.currency if found else None

    return LotLedgerResponse(
        lots=[lot_response(lot, currency(lot.vest.symbol)) for lot in lots],
        events=[
            event_response(e, currency=currency(e.symbol), issue=_issue(e, lots, market))
            for e in holdings.events
        ],
        symbols=sorted({vest.symbol for vest in holdings.vests}),
        first_year=min((lot.acquired_on.year for lot in lots), default=None),
        current_year=today.year,
        warnings=[*market.warnings, *lot_notes(lots)],
    )


def schedule_period(year: int, today: date) -> Period:
    if year > today.year:
        raise RsuTaxRuleError("That calendar year has not started yet.")
    return date(year, 1, 1), min(date(year, 12, 31), today)


def schedule_starts(holdings: Holdings, period: Period, today: date) -> dict[str, date]:
    """Stocks with a vest by the period's end; their histories start at the first vest."""
    return {symbol: day for symbol, day in holdings.first_vests(today).items() if day <= period[1]}


def schedule_fa_report(
    holdings: Holdings, market: MarketData, period: Period, today: date
) -> ScheduleFaResponse:
    """Schedule FA (Table A3) rows for every lot held at any time in a calendar year."""
    groups, indian = _by_currency(_lots(holdings, market, today), market)
    warnings = [*market.warnings, *indian_note(indian)]
    rows: list[ScheduleFaRowResponse] = []
    counted: set[int] = set()
    for currency, group in groups.items():
        symbols = {lot.vest.symbol for lot in group}
        dividends = [item for item in holdings.dividends if item.symbol in symbols]
        result = schedule_fa(
            group, dividends, market.quotes(), market.rate_series(currency), period
        )
        rows.extend(fa_row(row, market) for row in result.rows)
        counted |= result.counted_event_ids
    warnings.extend(uncounted_notes(holdings.events, period, counted, indian, market))
    rows.sort(key=lambda row: (row.acquired_on, row.lot_id))
    year = period[0].year
    return ScheduleFaResponse(
        calendar_year=year,
        period_start=period[0],
        period_end=period[1],
        in_progress=period[1] < date(year, 12, 31),
        return_label=return_label(year),
        rate_basis=RATE_BASIS,
        rows=rows,
        totals=fa_totals(rows),
        warnings=warnings,
    )


def fast_ds_starts(holdings: Holdings, today: date) -> dict[str, date]:
    return {s: day for s, day in holdings.first_vests(today).items() if day <= VALUATION_DATE}


def fast_ds_report(holdings: Holdings, market: MarketData, today: date) -> FastDsResponse:
    """Each lot held on 2026-03-31 at the higher of cost and that day's average quote."""
    lots = _lots(holdings, market, min(today, VALUATION_DATE))
    held = [lot for lot in lots if lot.vest_shares_after(VALUATION_DATE) > 0]
    groups, indian = _by_currency(held, market)
    rows: list[FastDsRowResponse] = []
    for currency, group in groups.items():
        series = market.rate_series(currency)
        rate = series.on_or_before(VALUATION_DATE)
        rows.extend(ds_row(row, currency, rate) for row in fast_ds(group, market.quotes(), series))
    return FastDsResponse(
        valuation_date=VALUATION_DATE,
        deadline=DEADLINE,
        days_left=(DEADLINE - today).days,
        rate_basis=RATE_BASIS,
        rows=rows,
        total_value_inr=sum(row.value_inr or 0 for row in rows),
        complete=all(row.cost_inr is not None and row.market_value_inr is not None for row in rows),
        warnings=[*market.warnings, *indian_note(indian)],
    )

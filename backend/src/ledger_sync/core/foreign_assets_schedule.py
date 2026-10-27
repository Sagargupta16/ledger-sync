"""Schedule FA rows for one calendar year of RSU lots.

A computation aid, not tax advice. For AY 2026-27 (Income-tax Act 1961) the
ITR-2 Schedule FA tables cover the calendar year ending 31 December 2025, so a
row covers January to December of the chosen year, not the financial year.

Peak and closing values come from the stock's daily closes and the ECB
reference rate of the day, an approximation of the SBI TT buying rate the form
asks for. Closes are split-adjusted, so a value is the lot's shares on today's
count times the close (see ``foreign_assets_quotes``). A sale or dividend
converts at the TTBR the user entered for it, else at the ECB rate of its day.
The initial value is the lot's tax value (its cost) for the shares held when
the period, or the holding, began.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ledger_sync.core.foreign_assets import DividendRecord, paisa, rupees
from ledger_sync.core.foreign_assets_lots import Lot
from ledger_sync.core.foreign_assets_quotes import DailyQuote, RateSeries, quote_on_or_before

_ZERO = Decimal(0)
type Period = tuple[date, date]


@dataclass(slots=True)
class ScheduleFaRow:
    lot: Lot
    # Share counts as on the period's first and last day (after any split by then).
    shares_at_start: Decimal
    shares_at_end: Decimal
    initial_value_inr: Decimal | None = None
    peak_value_inr: Decimal | None = None
    peak_value_quote: Decimal | None = None
    peak_date: date | None = None
    peak_rate: Decimal | None = None
    closing_value_inr: Decimal | None = None
    closing_value_quote: Decimal | None = None
    closing_price_date: date | None = None
    closing_rate: Decimal | None = None
    dividends_quote: Decimal = _ZERO
    dividends_inr: Decimal = _ZERO
    tax_withheld_quote: Decimal = _ZERO
    tax_withheld_inr: Decimal = _ZERO
    sale_proceeds_quote: Decimal = _ZERO
    sale_proceeds_inr: Decimal = _ZERO
    flags: list[str] = field(default_factory=list)

    def flag(self, name: str) -> None:
        if name not in self.flags:
            self.flags.append(name)


@dataclass(slots=True)
class ScheduleFaResult:
    rows: list[ScheduleFaRow]
    # Sales and dividends that reached a row; the caller reports the rest.
    counted_event_ids: set[int]


def _value_peak(
    row: ScheduleFaRow, quotes: Sequence[DailyQuote], rates: RateSeries, period: Period
) -> None:
    lot, first = row.lot, max(row.lot.acquired_on, period[0])
    best: tuple[Decimal, Decimal, date, Decimal] | None = None
    for quote in quotes:
        if not first <= quote.day <= period[1]:
            continue
        shares = lot.market_shares(lot.vest_shares_before(quote.day))
        rate = rates.on_or_before(quote.day) if shares > 0 else None
        if rate is None:
            continue
        value = shares * quote.close * rate[1]
        if best is None or value > best[0]:
            best = (value, shares * quote.close, quote.day, rate[1])
    if best is None:
        row.flag("no_peak_value")
        return
    row.peak_value_inr, row.peak_value_quote = rupees(best[0]), paisa(best[1])
    row.peak_date, row.peak_rate = best[2], best[3]


def _value_closing(
    row: ScheduleFaRow, quotes: Sequence[DailyQuote], rates: RateSeries, end: date
) -> None:
    held = row.lot.vest_shares_after(end)
    if held <= 0:
        row.closing_value_inr, row.closing_value_quote = _ZERO, _ZERO
        return
    quote, rate = quote_on_or_before(quotes, end), rates.on_or_before(end)
    if quote is None or rate is None:
        row.flag("no_closing_value")
        return
    closing = row.lot.market_shares(held) * quote.close
    row.closing_value_inr, row.closing_value_quote = rupees(closing * rate[1]), paisa(closing)
    row.closing_price_date, row.closing_rate = quote.day, rate[1]


def _event_rate(user_rate: Decimal | None, rates: RateSeries, day: date) -> Decimal | None:
    if user_rate is not None:
        return user_rate
    found = rates.on_or_before(day)
    return None if found is None else found[1]


def _add_sales(row: ScheduleFaRow, rates: RateSeries, period: Period, counted: set[int]) -> None:
    for sale in row.lot.sales:
        if not period[0] <= sale.day <= period[1]:
            continue
        counted.add(sale.event_id)
        row.sale_proceeds_quote += sale.proceeds
        rate = _event_rate(sale.fx_rate, rates, sale.day)
        if rate is None:
            row.flag("no_rates")
        else:
            row.sale_proceeds_inr += sale.proceeds * rate


def _allocate_dividends(
    rows: Sequence[ScheduleFaRow],
    dividends: Sequence[DividendRecord],
    rates: RateSeries,
    period: Period,
    counted: set[int],
) -> None:
    """Split each dividend across the lots by the shares each held that day."""
    for dividend in dividends:
        if not period[0] <= dividend.day <= period[1]:
            continue
        # Today's count, so lots vested either side of a split weigh alike.
        holders = [
            (row, row.lot.market_shares(row.lot.vest_shares_before(dividend.day)))
            for row in rows
            if row.lot.vest.symbol == dividend.symbol
        ]
        total = sum((shares for _, shares in holders), _ZERO)
        if total <= 0:
            continue
        counted.add(dividend.event_id)
        rate = _event_rate(dividend.fx_rate, rates, dividend.day)
        for row, shares in holders:
            part = shares / total
            row.dividends_quote += dividend.gross * part
            row.tax_withheld_quote += dividend.tax_withheld * part
            if rate is None:
                row.flag("no_rates")
                continue
            row.dividends_inr += dividend.gross * part * rate
            row.tax_withheld_inr += dividend.tax_withheld * part * rate


def schedule_fa(
    lots: Sequence[Lot],
    dividends: Sequence[DividendRecord],
    quotes_by_symbol: Mapping[str, Sequence[DailyQuote]],
    rates: RateSeries,
    period: Period,
) -> ScheduleFaResult:
    """Rows for every lot held at any time in ``period`` (a calendar year, or its part to date).

    A symbol missing from ``quotes_by_symbol`` had no price data: its rows keep
    their cost and events but no peak or closing value.
    """
    rows: list[ScheduleFaRow] = []
    counted: set[int] = set()
    for lot in lots:
        first = max(period[0], lot.acquired_on)
        opening = lot.vest_shares_before(first)
        if lot.acquired_on > period[1] or opening <= 0:
            continue
        row = ScheduleFaRow(
            lot,
            shares_at_start=lot.shares_on(first, opening),
            shares_at_end=lot.shares_on(period[1], lot.vest_shares_after(period[1])),
        )
        cost = lot.cost_inr(opening)
        row.initial_value_inr = None if cost is None else rupees(cost)
        row.flags.extend(lot.flags)
        quotes = quotes_by_symbol.get(lot.vest.symbol)
        if quotes is None:
            row.flag("no_prices")
        else:
            _value_peak(row, quotes, rates, period)
            _value_closing(row, quotes, rates, period[1])
        _add_sales(row, rates, period, counted)
        rows.append(row)
    _allocate_dividends(rows, dividends, rates, period, counted)
    for row in rows:
        row.sale_proceeds_inr = rupees(row.sale_proceeds_inr)
        row.dividends_inr = rupees(row.dividends_inr)
        row.tax_withheld_inr = rupees(row.tax_withheld_inr)
    return ScheduleFaResult(rows, counted)

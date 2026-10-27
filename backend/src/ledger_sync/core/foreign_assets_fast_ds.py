"""FAST-DS 2026: what each RSU lot was worth on 2026-03-31.

A computation aid, not tax advice. The scheme (Finance Act 2026, ss.130-144)
values a foreign asset at 2026-03-31; for listed shares that is the higher of
cost and the average of the day's highest and lowest quote, converted at the
reference rate (the ECB rate here, an approximation). Declarations close on
2026-12-31. Whether a holding needs declaring, and in which category, depends
on the user's past returns and is for a CA to confirm.

Quotes are split-adjusted, so the market value is the lot's shares on today's
count times the adjusted average; the shares and average shown are the ones of
2026-03-31 itself.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from ledger_sync.core.foreign_assets import paisa, rupees
from ledger_sync.core.foreign_assets_lots import Lot
from ledger_sync.core.foreign_assets_quotes import (
    DailyQuote,
    RateSeries,
    quote_on_or_before,
    split_factor,
)

VALUATION_DATE = date(2026, 3, 31)
DEADLINE = date(2026, 12, 31)


@dataclass(frozen=True, slots=True)
class FastDsRow:
    lot: Lot
    # Shares held when 2026-03-31 closed, on that day's count.
    shares: Decimal
    cost_inr: Decimal | None
    quote_date: date | None
    # The average of that day's high and low, on that day's count.
    average_quote: Decimal | None
    market_value_quote: Decimal | None
    market_value_inr: Decimal | None

    @property
    def value_inr(self) -> Decimal | None:
        known = [value for value in (self.cost_inr, self.market_value_inr) if value is not None]
        return max(known) if known else None

    @property
    def basis(self) -> str | None:
        """Which side of "higher of cost and market" set the value."""
        if self.value_inr is None:
            return None
        market, cost = self.market_value_inr, self.cost_inr
        return "market" if market is not None and (cost is None or market > cost) else "cost"


def _average(quote: DailyQuote) -> Decimal:
    if quote.high is not None and quote.low is not None:
        return (quote.high + quote.low) / 2
    return quote.close


def fast_ds(
    lots: Sequence[Lot],
    quotes_by_symbol: Mapping[str, Sequence[DailyQuote]],
    rates: RateSeries,
) -> list[FastDsRow]:
    """One row per lot still held when 2026-03-31 closed."""
    rate = rates.on_or_before(VALUATION_DATE)
    rows: list[FastDsRow] = []
    for lot in lots:
        held = lot.vest_shares_after(VALUATION_DATE)
        if lot.acquired_on > VALUATION_DATE or held <= 0:
            continue
        quote = quote_on_or_before(quotes_by_symbol.get(lot.vest.symbol, ()), VALUATION_DATE)
        cost = lot.cost_inr(held)
        adjusted = None if quote is None else _average(quote)
        market = None if adjusted is None else lot.market_shares(held) * adjusted
        # Splits after the valuation date are in the adjusted quote; undo them for display.
        later = split_factor(lot.splits, VALUATION_DATE)
        rows.append(
            FastDsRow(
                lot=lot,
                shares=lot.shares_on(VALUATION_DATE, held),
                cost_inr=None if cost is None else rupees(cost),
                quote_date=None if quote is None else quote.day,
                average_quote=None if adjusted is None else paisa(adjusted * later),
                market_value_quote=None if market is None else paisa(market),
                market_value_inr=(
                    None if market is None or rate is None else rupees(market * rate[1])
                ),
            )
        )
    return rows

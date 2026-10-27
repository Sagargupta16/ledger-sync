"""Market data for one foreign-asset report: stock histories with splits, and ECB rates.

At most ``MAX_SYMBOLS`` stocks are fetched per request, a few at a time and
concurrently, under one overall deadline that keeps a report well inside a
serverless function's time limit. Whatever fails or runs out of time is left
out with a warning, so a report shows the values it could compute, never a
500. The fetching and caching itself is ``foreign_assets_upstream``.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import date

import anyio
import httpx

from ledger_sync.core.foreign_assets_quotes import DailyQuote, RateSeries, Split
from ledger_sync.core.foreign_assets_upstream import (
    SymbolHistory,
    fetch_history,
    fetch_rates,
    history_start,
)

# Yahoo tickers, as the stock-price route accepts them: AMZN, BRK-B, RELIANCE.NS.
_TICKER = re.compile(r"^[A-Za-z0-9.^=-]{1,20}$")
MAX_SYMBOLS = 10
_CONCURRENCY = 4
# backend/vercel.json sets no maxDuration, so leave room under a 10-second plan limit.
_DEADLINE_SECONDS = 7.0


@dataclass(slots=True)
class MarketData:
    history: dict[str, SymbolHistory] = field(default_factory=dict)
    rates: dict[str, RateSeries] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def currency(self, symbol: str) -> str:
        """The quote currency, assumed USD when the prices could not be loaded."""
        found = self.history.get(symbol)
        return found.currency if found else "USD"

    def name(self, symbol: str) -> str:
        found = self.history.get(symbol)
        return found.name if found else symbol

    def quotes(self) -> dict[str, tuple[DailyQuote, ...]]:
        return {symbol: found.quotes for symbol, found in self.history.items()}

    def splits(self) -> dict[str, tuple[Split, ...]]:
        return {symbol: found.splits for symbol, found in self.history.items()}

    def rate_series(self, currency: str) -> RateSeries:
        return self.rates.get(currency) or RateSeries({})


def _tickers(starts: Mapping[str, date], warnings: list[str]) -> dict[str, date]:
    """Valid tickers, at most ``MAX_SYMBOLS``, each with its history's first day."""
    valid = [symbol for symbol in sorted(starts) if _TICKER.fullmatch(symbol)]
    for symbol in sorted(set(starts) - set(valid)):
        warnings.append(
            f'"{symbol}" is not a ticker symbol, so it has no market prices. '
            "Use the ticker (for example AMZN) as the grant's stock name in Settings."
        )
    if len(valid) > MAX_SYMBOLS:
        warnings.append(
            f"Only {MAX_SYMBOLS} stocks are priced at a time, so "
            f"{', '.join(valid[MAX_SYMBOLS:])} have no market data here."
        )
    return {symbol: history_start(starts[symbol]) for symbol in valid[:MAX_SYMBOLS]}


def _foreign(market: MarketData, symbols: Iterable[str]) -> list[str]:
    return sorted({market.currency(symbol) for symbol in symbols} - {"INR"})


async def _gather(
    client: httpx.AsyncClient, wanted: dict[str, date], market: MarketData, *, with_rates: bool
) -> None:
    limiter = anyio.CapacityLimiter(_CONCURRENCY)

    async def one_history(symbol: str, start: date) -> None:
        async with limiter:
            found = await fetch_history(client, symbol, start)
        if found is not None:
            market.history[symbol] = found

    async def one_rate(currency: str, start: date) -> None:
        async with limiter:
            found = await fetch_rates(client, currency, start)
        if found is not None:
            market.rates[currency] = found

    async with anyio.create_task_group() as group:
        for symbol, start in wanted.items():
            group.start_soon(one_history, symbol, start)
    if with_rates and wanted:
        # The earliest history start covers every window any report asks about.
        rates_from = min(wanted.values())
        async with anyio.create_task_group() as group:
            for currency in _foreign(market, wanted):
                group.start_soon(one_rate, currency, rates_from)


async def load_market(
    client: httpx.AsyncClient, starts: Mapping[str, date], *, with_rates: bool
) -> MarketData:
    """History for each ticker from the year of ``starts[symbol]``, and ECB rates if asked."""
    market = MarketData()
    wanted = _tickers(starts, market.warnings)
    with anyio.move_on_after(_DEADLINE_SECONDS) as scope:
        await _gather(client, wanted, market, with_rates=with_rates)
    late = " in time" if scope.cancelled_caught else ""
    for symbol in wanted:
        if symbol not in market.history:
            market.warnings.append(
                f"Market data for {symbol} could not be loaded{late}, so its prices and split "
                "history are missing. Try again."
            )
    for currency in _foreign(market, wanted) if with_rates else ():
        if currency not in market.rates:
            market.warnings.append(
                f"ECB {currency}/INR rates could not be loaded{late}, so rupee values that "
                "need them are missing. Try again."
            )
    return market


async def load_history(client: httpx.AsyncClient, symbol: str, since: date) -> SymbolHistory | None:
    """One stock's history from the year of ``since``, for a single vest-date lookup."""
    found = None
    if _TICKER.fullmatch(symbol):
        with anyio.move_on_after(_DEADLINE_SECONDS):
            found = await fetch_history(client, symbol, history_start(since))
    return found

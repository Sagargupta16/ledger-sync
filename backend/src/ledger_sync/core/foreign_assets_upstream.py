"""Fetch and cache one stock's daily history, or one currency's ECB rates to INR.

The same upstreams as ``stock_price`` (the unofficial Yahoo chart API) and
``exchange_rates`` (frankfurter.dev v1, the ECB series). One request per stock
covers its whole history from the first vest's year to today, so it carries
every split behind Yahoo's adjusted quotes and serves the lot ledger, every
Schedule FA year and FAST-DS alike; one request per currency does the same for
rates. Both are cached in memory per worker for six hours, like
``exchange_rates``: the data is public and cheap to fetch again after a cold
start. A failure returns None and is logged; the caller words the warning.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any
from urllib.parse import quote

import anyio
import httpx

from ledger_sync.core.foreign_assets_chart import parse_chart
from ledger_sync.core.foreign_assets_quotes import DailyQuote, RateSeries, Split
from ledger_sync.core.ledger_clock import ledger_today

logger = logging.getLogger(__name__)

_YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
_FRANKFURTER_SERIES_URL = "https://api.frankfurter.dev/v1/{start}..{end}"
_TIMEOUT = httpx.Timeout(5.0, connect=3.0)
_RATE_ATTEMPTS = 2
_RETRY_DELAY_SECONDS = 0.5
# Histories start this long before 1 January of the first year they cover, so
# that year's first days have a prior quote and rate.
_LEAD_DAYS = 10
_TTL_SECONDS = 6 * 3600
_CACHE_LIMIT = 32


@dataclass(frozen=True, slots=True)
class SymbolHistory:
    start: date
    currency: str
    name: str
    quotes: tuple[DailyQuote, ...]
    splits: tuple[Split, ...]


_history_cache: dict[str, tuple[float, SymbolHistory]] = {}
_rates_cache: dict[str, tuple[float, tuple[date, RateSeries]]] = {}


def history_start(day: date) -> date:
    return date(day.year, 1, 1) - timedelta(days=_LEAD_DAYS)


def _fresh[V](cache: dict[str, tuple[float, V]], key: str) -> V | None:
    found = cache.get(key)
    return found[1] if found and time.monotonic() - found[0] < _TTL_SECONDS else None


def _remember[V](cache: dict[str, tuple[float, V]], key: str, value: V) -> None:
    cache[key] = (time.monotonic(), value)
    while len(cache) > _CACHE_LIMIT:
        del cache[min(cache, key=lambda item: cache[item][0])]


def _epoch(day: date) -> int:
    return int(datetime.combine(day, datetime.min.time(), tzinfo=UTC).timestamp())


async def fetch_history(
    client: httpx.AsyncClient, symbol: str, start: date
) -> SymbolHistory | None:
    """Daily quotes and splits for a valid ticker from ``start`` to today."""
    cached = _fresh(_history_cache, symbol)
    if cached is not None and cached.start <= start:
        return cached
    params: dict[str, str | int] = {
        "interval": "1d",
        "period1": _epoch(start),
        "period2": _epoch(ledger_today() + timedelta(days=2)),
        "events": "split",
    }
    try:
        response = await client.get(
            _YAHOO_CHART_URL.format(symbol=quote(symbol, safe="")),
            params=params,
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        currency, name, quotes, splits = parse_chart(response.json())
    except httpx.HTTPError, ValueError, KeyError, IndexError, TypeError, AttributeError:
        logger.warning("Daily quotes unavailable for %r", symbol, exc_info=True)
        return None
    found = SymbolHistory(start, currency, name or symbol, tuple(quotes), tuple(splits))
    _remember(_history_cache, symbol, found)
    return found


def _parse_rates(payload: Any) -> RateSeries:
    return RateSeries(
        {
            date.fromisoformat(day): Decimal(str(values["INR"]))
            for day, values in payload["rates"].items()
            if isinstance(values, dict) and "INR" in values
        }
    )


async def fetch_rates(client: httpx.AsyncClient, currency: str, start: date) -> RateSeries | None:
    """ECB rates in rupees per unit of ``currency`` from ``start`` to today."""
    cached = _fresh(_rates_cache, currency)
    if cached is not None and cached[0] <= start:
        return cached[1]
    url = _FRANKFURTER_SERIES_URL.format(start=start.isoformat(), end=ledger_today().isoformat())
    for attempt in range(_RATE_ATTEMPTS):
        try:
            response = await client.get(
                url, params={"from": currency, "to": "INR"}, timeout=_TIMEOUT, follow_redirects=True
            )
            response.raise_for_status()
            series = _parse_rates(response.json())
        except httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError:
            if attempt < _RATE_ATTEMPTS - 1:
                await anyio.sleep(_RETRY_DELAY_SECONDS)
            continue
        _remember(_rates_cache, currency, (start, series))
        return series
    logger.warning("ECB rates unavailable for %s", currency)
    return None

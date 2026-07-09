"""Stock price lookup endpoint.

Proxies Yahoo Finance chart API to avoid CORS restrictions on the frontend.
Returns the latest regular-market price for a given ticker symbol, or the
closing price on a specific date when ``on_date`` is provided (used to lock
in vest-date prices for RSU vestings).
"""

from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from ledger_sync.api.deps import CurrentUser
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="/api/stock-price", tags=["stock-price"])

_YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"

# Look back a few days from the requested date so weekends/market holidays
# still resolve to the most recent prior trading day's close.
_HISTORICAL_LOOKBACK_DAYS = 7


class StockPriceResponse(BaseModel):
    symbol: str
    price: float
    currency: str
    as_of: date | None = None


def _historical_close(data: dict[str, Any], on_date: date) -> tuple[float, date]:
    """Pick the last close on or before ``on_date`` from a Yahoo chart payload.

    Raises KeyError/IndexError/TypeError on malformed payloads, which the
    caller maps to a 502.
    """
    result = data["chart"]["result"][0]
    timestamps: list[int] = result["timestamp"]
    closes: list[float | None] = result["indicators"]["quote"][0]["close"]

    best: tuple[float, date] | None = None
    for ts, close in zip(timestamps, closes, strict=False):
        if close is None:
            continue
        trading_day = datetime.fromtimestamp(ts, tz=UTC).date()
        if trading_day <= on_date:
            best = (float(close), trading_day)
    if best is None:
        raise KeyError(f"no close on or before {on_date}")
    return best


@router.get(
    "/{symbol}",
    responses={
        400: {"description": "Invalid symbol"},
        502: {"description": "Could not fetch price from upstream"},
    },
)
async def get_stock_price(
    symbol: str,
    request: Request,
    _current_user: CurrentUser,
    on_date: Annotated[
        date | None,
        Query(
            description=(
                "Return the closing price on this date "
                "(or the nearest prior trading day) instead of the latest price."
            ),
        ),
    ] = None,
) -> StockPriceResponse:
    """Fetch a stock price for a ticker symbol via Yahoo Finance.

    Args:
        symbol: Stock ticker (e.g. AMZN, AAPL, GOOGL).
        request: FastAPI request (for shared httpx client).
        on_date: Optional historical date; when set, returns that day's close
            (falling back to the nearest prior trading day within a week).

    Returns:
        Stock price response with symbol, price, currency, and the date the
        price is as of (None for latest-price lookups).

    """
    symbol = symbol.upper().strip()
    if not symbol or len(symbol) > 10:
        raise HTTPException(status_code=400, detail="Invalid symbol")
    if on_date is not None and on_date > datetime.now(tz=UTC).date():
        raise HTTPException(status_code=400, detail="on_date cannot be in the future")

    url = _YAHOO_CHART_URL.format(symbol=symbol)
    if on_date is None:
        params: dict[str, str | int] = {"interval": "1d", "range": "1d"}
    else:
        window_start = on_date - timedelta(days=_HISTORICAL_LOOKBACK_DAYS)
        params = {
            "interval": "1d",
            "period1": int(
                datetime.combine(window_start, datetime.min.time(), tzinfo=UTC).timestamp()
            ),
            "period2": int(
                datetime.combine(
                    on_date + timedelta(days=1), datetime.min.time(), tzinfo=UTC
                ).timestamp()
            ),
        }

    try:
        client = request.app.state.http_client
        resp = await client.get(
            url,
            params=params,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()
        data = resp.json()

        meta = data["chart"]["result"][0]["meta"]
        currency = meta.get("currency", "USD")

        if on_date is None:
            price = meta["regularMarketPrice"]
            return StockPriceResponse(symbol=symbol, price=price, currency=currency)

        price, as_of = _historical_close(data, on_date)
        return StockPriceResponse(symbol=symbol, price=price, currency=currency, as_of=as_of)

    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Failed to fetch stock price for %s: %s", symbol, e)
        raise HTTPException(
            status_code=502,
            detail=f"Could not fetch price for {symbol}",
        ) from e

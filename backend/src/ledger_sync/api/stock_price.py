"""Stock price lookup endpoint.

Proxies Yahoo Finance chart API to avoid CORS restrictions on the frontend.
Returns the latest regular-market price for a given ticker symbol.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ledger_sync.api.deps import CurrentUser
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="/stock-price", tags=["stock-price"])

_YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"


class StockPriceResponse(BaseModel):
    symbol: str
    price: float
    currency: str


@router.get("/{symbol}", response_model=StockPriceResponse)
async def get_stock_price(
    symbol: str,
    request: Request,
    _current_user: CurrentUser,
) -> StockPriceResponse:
    """Fetch latest stock price for a ticker symbol via Yahoo Finance.

    Args:
        symbol: Stock ticker (e.g. AMZN, AAPL, GOOGL).
        request: FastAPI request (for shared httpx client).

    Returns:
        Stock price response with symbol, price, and currency.

    """
    symbol = symbol.upper().strip()
    if not symbol or len(symbol) > 10:
        raise HTTPException(status_code=400, detail="Invalid symbol")

    url = _YAHOO_CHART_URL.format(symbol=symbol)
    try:
        client = request.app.state.http_client
        resp = await client.get(
            url,
            params={"interval": "1d", "range": "1d"},
            headers={"User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()
        data = resp.json()

        meta = data["chart"]["result"][0]["meta"]
        price = meta["regularMarketPrice"]
        currency = meta.get("currency", "USD")

        return StockPriceResponse(symbol=symbol, price=price, currency=currency)

    except Exception as e:
        logger.warning("Failed to fetch stock price for %s: %s", symbol, e)
        raise HTTPException(
            status_code=502,
            detail=f"Could not fetch price for {symbol}",
        ) from e

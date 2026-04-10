"""Exchange rate proxy endpoint.

Fetches rates from frankfurter.dev (free, no API key, ECB data) and
caches them in-memory for 24 hours. Falls back to stale cache or
hardcoded rates if the external API is unavailable.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from ledger_sync.api.deps import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])

_CACHE_TTL = 86400  # 24 hours in seconds
_FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest"

# Per-worker in-memory cache. Each uvicorn/Vercel worker maintains its
# own copy; this is acceptable because the data is public and cheap to
# re-fetch after a cold start.
_rate_cache: dict[str, Any] = {}

# Approximate fallback rates (INR -> X) as of 2026-04-09
_FALLBACK_RATES: dict[str, float] = {
    "USD": 0.01079,
    "EUR": 0.00924,
    "GBP": 0.00804,
    "JPY": 1.7152,
    "CAD": 0.01494,
    "AUD": 0.01533,
    "CHF": 0.00853,
    "SGD": 0.01375,
    "AED": 0.03963,
    "CNY": 0.07376,
    "KRW": 15.967,
    "SEK": 0.10046,
    "NZD": 0.01849,
    "HKD": 0.08456,
}


def _cache_is_fresh() -> bool:
    fetched_at = _rate_cache.get("fetched_at")
    if not isinstance(fetched_at, (int, float)):
        return False
    return bool((time.time() - fetched_at) < _CACHE_TTL)


async def _fetch_rates(base: str) -> dict[str, float]:
    """Fetch latest rates from frankfurter.dev."""
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        resp = await client.get(_FRANKFURTER_URL, params={"from": base})
        resp.raise_for_status()
        data = resp.json()
        rates = data.get("rates", {})
        if not isinstance(rates, dict):
            return {}
        return dict(rates)


@router.get(
    "",
    responses={502: {"description": "Unable to fetch rates from external API"}},
)
async def get_exchange_rates(
    _current_user: CurrentUser,
    base: str = "INR",
) -> dict[str, Any]:
    """Return exchange rates for the given base currency.

    Uses a 24-hour in-memory cache. Falls back to stale cache or
    hardcoded approximate rates if the external API is unreachable.
    """
    if _cache_is_fresh() and _rate_cache.get("base") == base:
        return {
            "base": base,
            "rates": _rate_cache["rates"],
            "fetched_at": _rate_cache["fetched_at"],
        }

    try:
        rates = await _fetch_rates(base)
        _rate_cache["rates"] = rates
        _rate_cache["base"] = base
        _rate_cache["fetched_at"] = time.time()
        return {
            "base": base,
            "rates": rates,
            "fetched_at": _rate_cache["fetched_at"],
        }
    except Exception:
        logger.warning("Failed to fetch exchange rates for base=%s", base, exc_info=True)
        # Return stale cache if available
        if _rate_cache.get("rates") and _rate_cache.get("base") == base:
            return {
                "base": base,
                "rates": _rate_cache["rates"],
                "fetched_at": _rate_cache.get("fetched_at"),
                "stale": True,
            }
        # Last resort: hardcoded fallback
        if base == "INR":
            return {
                "base": "INR",
                "rates": _FALLBACK_RATES,
                "fetched_at": None,
                "fallback": True,
            }
        raise HTTPException(
            status_code=502,
            detail=f"Unable to fetch exchange rates for base={base}",
        )

"""Exchange rate proxy endpoint.

Fetches rates from frankfurter.app (free, no API key, ECB data) and
caches them in-memory for 24 hours. Falls back to stale cache or
hardcoded rates if the external API is unavailable.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from ledger_sync.api.deps import CurrentUser

router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])

_CACHE_TTL = 86400  # 24 hours in seconds
_FRANKFURTER_URL = "https://api.frankfurter.app/latest"

# In-memory cache: { "rates": {...}, "fetched_at": float }
_rate_cache: dict[str, Any] = {}

# Approximate fallback rates (INR -> X) as of 2026-04
_FALLBACK_RATES: dict[str, float] = {
    "USD": 0.01187,
    "EUR": 0.01092,
    "GBP": 0.00940,
    "JPY": 1.7800,
    "CAD": 0.01620,
    "AUD": 0.01830,
    "CHF": 0.01050,
    "SGD": 0.01590,
    "AED": 0.04360,
    "CNY": 0.08620,
    "KRW": 16.300,
    "SEK": 0.1230,
    "NZD": 0.02010,
    "HKD": 0.09260,
}


def _cache_is_fresh() -> bool:
    fetched_at = _rate_cache.get("fetched_at")
    if not isinstance(fetched_at, (int, float)):
        return False
    return bool((time.time() - fetched_at) < _CACHE_TTL)


async def _fetch_rates(base: str) -> dict[str, float]:
    """Fetch latest rates from frankfurter.app."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_FRANKFURTER_URL, params={"from": base})
        resp.raise_for_status()
        data = resp.json()
        rates = data.get("rates", {})
        if not isinstance(rates, dict):
            return {}
        return dict(rates)


@router.get("")
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

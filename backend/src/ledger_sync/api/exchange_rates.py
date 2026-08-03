"""Exchange rate proxy endpoint.

Fetches rates from frankfurter.dev (free, no API key, ECB data) and
caches them in-memory for 24 hours. Falls back to stale cache or
hardcoded rates if the external API is unavailable.
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, date, datetime
from typing import Annotated, Any

import anyio
import httpx
from fastapi import APIRouter, HTTPException, Query

from ledger_sync.api.deps import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/exchange-rates", tags=["exchange-rates"])

_CACHE_TTL = 86400  # 24 hours in seconds
_FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest"
# Same API shape, date in the path instead of "latest". Frankfurter serves the
# ECB reference rate for that date, falling back to the previous publication day
# on weekends and TARGET holidays (verified live: 2025-08-15 -> USD/INR 87.46).
_FRANKFURTER_HISTORICAL_URL = "https://api.frankfurter.dev/v1/{on_date}"

# One retry: the upstream's transient failures resolved within seconds when
# observed, and a vest-price lock is a foreground fetch the user is waiting on.
_UPSTREAM_ATTEMPTS = 2
_UPSTREAM_RETRY_DELAY_SECONDS = 1.5

# Per-worker in-memory cache. Each uvicorn/Vercel worker maintains its
# own copy; this is acceptable because the data is public and cheap to
# re-fetch after a cold start.
_rate_cache: dict[str, Any] = {}

# Approximate fallback rates (INR -> X). Refreshed when the module is updated.
# Used only when frankfurter.dev is unreachable AND the in-memory cache is empty.
# Responses built from this table carry ``fallback: true`` and ``fallback_as_of``
# so the frontend can warn the user that rates are stale.
# Values are ECB reference rates (via frankfurter.dev) for _FALLBACK_AS_OF,
# INR -> X. The previous table had drifted ~13% stale (USD at 0.01180 ≈ ₹84.7,
# vs the ~₹95.7 actual for the stated date). AED is not on ECB; derived from the
# USD peg (3.6725 AED/USD).
_FALLBACK_AS_OF = "2026-05-13"
_FALLBACK_RATES: dict[str, float] = {
    "USD": 0.01045,
    "EUR": 0.00892,
    "GBP": 0.00774,
    "JPY": 1.6491,
    "CAD": 0.01431,
    "AUD": 0.01442,
    "CHF": 0.00817,
    "SGD": 0.01330,
    "AED": 0.03838,
    "CNY": 0.07098,
    "KRW": 15.5592,
    "SEK": 0.09739,
    "NZD": 0.01762,
    "HKD": 0.08185,
}


def _cache_is_fresh() -> bool:
    fetched_at = _rate_cache.get("fetched_at")
    if not isinstance(fetched_at, (int, float)):
        return False
    return bool((time.time() - fetched_at) < _CACHE_TTL)


async def _fetch_rates(base: str, on_date: date | None = None) -> tuple[dict[str, float], str]:
    """Fetch rates from frankfurter.dev, latest or for a specific date.

    Returns the rate map plus the date frankfurter actually priced, which can
    precede ``on_date`` when it lands on a weekend or TARGET holiday.

    Retries once on a transient upstream failure. The historical endpoint was
    observed returning Cloudflare 520/522 and read timeouts intermittently while
    ``/latest`` stayed healthy, recovering within seconds. A historical lookup
    has no cache and no fallback to fall back ON (see the handler), so a single
    blip would otherwise leave a vest price unconverted.
    """
    url = (
        _FRANKFURTER_URL
        if on_date is None
        else _FRANKFURTER_HISTORICAL_URL.format(on_date=on_date.isoformat())
    )
    last_err: Exception | None = None
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        for attempt in range(_UPSTREAM_ATTEMPTS):
            try:
                resp = await client.get(url, params={"from": base})
                resp.raise_for_status()
                data = resp.json()
                rates = data.get("rates", {})
                if not isinstance(rates, dict):
                    return {}, ""
                return dict(rates), str(data.get("date", ""))
            except (httpx.HTTPError, ValueError) as err:
                last_err = err
                if attempt < _UPSTREAM_ATTEMPTS - 1:
                    await anyio.sleep(_UPSTREAM_RETRY_DELAY_SECONDS)
    raise last_err if last_err else RuntimeError("rate fetch failed")


@router.get(
    "",
    responses={
        400: {"description": "on_date is in the future"},
        502: {"description": "Unable to fetch rates from external API"},
    },
)
async def get_exchange_rates(
    _current_user: CurrentUser,
    base: str = "INR",
    on_date: Annotated[
        date | None,
        Query(
            description=(
                "Return the rate published on this date instead of the latest. "
                "Used to convert an RSU vest-date stock price at the FX rate that "
                "applied on the vest date."
            ),
        ),
    ] = None,
) -> dict[str, Any]:
    """Return exchange rates for the given base currency.

    Uses a 24-hour in-memory cache. Falls back to stale cache or
    hardcoded approximate rates if the external API is unreachable.

    ``on_date`` bypasses that cache and the fallback table entirely. A past
    ECB rate never changes, so a TTL is meaningless, and the fallback table is
    a single present-day snapshot -- serving it for a 2025 date would silently
    substitute today's rate, which is exactly the bug this parameter fixes.
    A failed historical lookup therefore errors instead, and the caller keeps
    the unconverted price.
    """
    if on_date is not None:
        if on_date > datetime.now(tz=UTC).date():
            raise HTTPException(status_code=400, detail="on_date cannot be in the future")
        try:
            rates, priced_on = await _fetch_rates(base, on_date)
        except (httpx.HTTPError, ValueError, KeyError) as err:
            logger.warning(
                "Failed to fetch historical rates base=%s on_date=%s", base, on_date, exc_info=True
            )
            raise HTTPException(
                status_code=502,
                detail=f"Unable to fetch exchange rates for {on_date}",
            ) from err
        return {
            "base": base,
            "rates": rates,
            # The date frankfurter priced, which precedes on_date across a
            # weekend or holiday. Surfaced so the caller can show what it used.
            "as_of": priced_on or on_date.isoformat(),
            "requested_date": on_date.isoformat(),
            "historical": True,
        }

    if _cache_is_fresh() and _rate_cache.get("base") == base:
        return {
            "base": base,
            "rates": _rate_cache["rates"],
            "fetched_at": _rate_cache["fetched_at"],
        }

    try:
        rates, _ = await _fetch_rates(base)
        _rate_cache["rates"] = rates
        _rate_cache["base"] = base
        _rate_cache["fetched_at"] = time.time()
        return {
            "base": base,
            "rates": rates,
            "fetched_at": _rate_cache["fetched_at"],
        }
    except (httpx.HTTPError, ValueError, KeyError) as err:
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
                "fallback_as_of": _FALLBACK_AS_OF,
            }
        raise HTTPException(
            status_code=502,
            detail=f"Unable to fetch exchange rates for base={base}",
        ) from err

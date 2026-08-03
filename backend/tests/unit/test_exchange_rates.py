"""Tests for exchange rate proxy endpoint."""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException

from ledger_sync.api.exchange_rates import (
    _FALLBACK_RATES,
    _fetch_rates,
    _rate_cache,
    get_exchange_rates,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    """Clear the module-level rate cache before each test."""
    _rate_cache.clear()
    yield
    _rate_cache.clear()


class FakeUser:
    id = 1


def test_fetch_and_cache_rates():
    """Should fetch rates from external API and cache them."""
    mock_rates = {"USD": 0.01187, "EUR": 0.01092}
    # `_fetch_rates` returns (rates, priced_on): the second element is the date
    # frankfurter actually priced, which matters only for historical lookups.
    with patch(
        "ledger_sync.api.exchange_rates._fetch_rates",
        new_callable=AsyncMock,
        return_value=(mock_rates, ""),
    ):
        result = asyncio.run(get_exchange_rates(_current_user=FakeUser(), base="INR"))
    assert result["base"] == "INR"
    assert result["rates"] == mock_rates
    assert result["fetched_at"] is not None
    assert "stale" not in result
    assert "fallback" not in result


def test_returns_cached_rates():
    """Should return cached rates without hitting external API."""
    _rate_cache["rates"] = {"USD": 0.012}
    _rate_cache["base"] = "INR"
    _rate_cache["fetched_at"] = time.time()  # fresh

    with patch(
        "ledger_sync.api.exchange_rates._fetch_rates",
        new_callable=AsyncMock,
    ) as mock_fetch:
        result = asyncio.run(get_exchange_rates(_current_user=FakeUser(), base="INR"))
    mock_fetch.assert_not_called()
    assert result["rates"]["USD"] == pytest.approx(0.012)


def test_stale_cache_on_api_failure():
    """Should return stale cache when API fails."""
    _rate_cache["rates"] = {"USD": 0.011}
    _rate_cache["base"] = "INR"
    _rate_cache["fetched_at"] = time.time() - 100000  # stale

    with patch(
        "ledger_sync.api.exchange_rates._fetch_rates",
        new_callable=AsyncMock,
        side_effect=httpx.HTTPError("API down"),
    ):
        result = asyncio.run(get_exchange_rates(_current_user=FakeUser(), base="INR"))
    assert result["stale"] is True
    assert result["rates"]["USD"] == pytest.approx(0.011)


def test_fallback_rates_when_no_cache():
    """Should return hardcoded fallback when API fails and no cache exists."""
    with patch(
        "ledger_sync.api.exchange_rates._fetch_rates",
        new_callable=AsyncMock,
        side_effect=httpx.HTTPError("API down"),
    ):
        result = asyncio.run(get_exchange_rates(_current_user=FakeUser(), base="INR"))
    assert result["fallback"] is True
    assert result["rates"] == _FALLBACK_RATES


class TestHistoricalRates:
    """`on_date` converts a past value at the rate that applied then.

    The RSU vest-date price was being converted at TODAY's FX: a 2025-08-15
    close in USD times the 2026-08-03 USD/INR. Measured on a real vest that
    overstated the line by 9% (87.46 then vs 95.34 now), and RSU perquisite
    value is fixed at vesting under Indian rules, so the drift fed straight
    into the tax projection.
    """

    def test_historical_date_returns_that_days_rate(self):
        with patch(
            "ledger_sync.api.exchange_rates._fetch_rates",
            new_callable=AsyncMock,
            return_value=({"INR": 87.46}, "2025-08-15"),
        ):
            result = asyncio.run(
                get_exchange_rates(_current_user=FakeUser(), base="USD", on_date=date(2025, 8, 15))
            )
        assert result["historical"] is True
        assert result["rates"]["INR"] == pytest.approx(87.46)
        assert result["as_of"] == "2025-08-15"
        assert result["requested_date"] == "2025-08-15"

    def test_weekend_reports_the_date_actually_priced(self):
        """Frankfurter prices the prior publication day; say so rather than imply the ask."""
        with patch(
            "ledger_sync.api.exchange_rates._fetch_rates",
            new_callable=AsyncMock,
            return_value=({"INR": 87.46}, "2025-08-15"),
        ):
            result = asyncio.run(
                get_exchange_rates(_current_user=FakeUser(), base="USD", on_date=date(2025, 8, 16))
            )
        assert result["as_of"] == "2025-08-15"
        assert result["requested_date"] == "2025-08-16"

    def test_historical_bypasses_the_ttl_cache(self):
        """A stale-but-present cache must not answer a dated request."""
        _rate_cache["rates"] = {"INR": 95.34}
        _rate_cache["base"] = "USD"
        _rate_cache["fetched_at"] = time.time()

        with patch(
            "ledger_sync.api.exchange_rates._fetch_rates",
            new_callable=AsyncMock,
            return_value=({"INR": 87.46}, "2025-08-15"),
        ) as fetch:
            result = asyncio.run(
                get_exchange_rates(_current_user=FakeUser(), base="USD", on_date=date(2025, 8, 15))
            )
        assert fetch.await_count == 1
        assert result["rates"]["INR"] == pytest.approx(87.46)

    def test_historical_failure_errors_instead_of_serving_todays_rate(self):
        """The fallback table is a present-day snapshot -- serving it IS the bug."""
        with (
            patch(
                "ledger_sync.api.exchange_rates._fetch_rates",
                new_callable=AsyncMock,
                side_effect=httpx.HTTPError("API down"),
            ),
            pytest.raises(HTTPException) as exc,
        ):
            asyncio.run(
                get_exchange_rates(_current_user=FakeUser(), base="USD", on_date=date(2025, 8, 15))
            )
        assert exc.value.status_code == 502

    def test_future_date_rejected(self):
        # UTC, matching the handler's own `datetime.now(tz=UTC).date()` comparison.
        future = datetime.now(tz=UTC).date() + timedelta(days=1)
        with pytest.raises(HTTPException) as exc:
            asyncio.run(get_exchange_rates(_current_user=FakeUser(), base="USD", on_date=future))
        assert exc.value.status_code == 400


class TestUpstreamRetry:
    """The historical endpoint returned Cloudflare 520/522 intermittently."""

    def test_retries_once_then_succeeds(self):
        calls = {"n": 0}

        async def flaky(*_args, **_kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise httpx.ReadTimeout("upstream blip")
            request = httpx.Request("GET", "https://api.frankfurter.dev/v1/2025-08-15")
            return httpx.Response(
                200, json={"date": "2025-08-15", "rates": {"INR": 87.46}}, request=request
            )

        with (
            patch("httpx.AsyncClient.get", new=flaky),
            patch("ledger_sync.api.exchange_rates.anyio.sleep", new_callable=AsyncMock),
        ):
            rates, priced_on = asyncio.run(_fetch_rates("USD", date(2025, 8, 15)))
        assert calls["n"] == 2
        assert rates["INR"] == pytest.approx(87.46)
        assert priced_on == "2025-08-15"

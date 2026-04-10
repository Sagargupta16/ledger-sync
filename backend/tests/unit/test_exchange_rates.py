"""Tests for exchange rate proxy endpoint."""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest

from ledger_sync.api.exchange_rates import (
    _FALLBACK_RATES,
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
    with patch(
        "ledger_sync.api.exchange_rates._fetch_rates",
        new_callable=AsyncMock,
        return_value=mock_rates,
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
        side_effect=Exception("API down"),
    ):
        result = asyncio.run(get_exchange_rates(_current_user=FakeUser(), base="INR"))
    assert result["stale"] is True
    assert result["rates"]["USD"] == pytest.approx(0.011)


def test_fallback_rates_when_no_cache():
    """Should return hardcoded fallback when API fails and no cache exists."""
    with patch(
        "ledger_sync.api.exchange_rates._fetch_rates",
        new_callable=AsyncMock,
        side_effect=Exception("API down"),
    ):
        result = asyncio.run(get_exchange_rates(_current_user=FakeUser(), base="INR"))
    assert result["fallback"] is True
    assert result["rates"] == _FALLBACK_RATES

"""Unit tests for the stock price lookup endpoint.

The Yahoo Finance upstream is mocked via the app's shared httpx client, so
these verify the HTTP contract: latest-price lookups, historical vest-date
lookups (including weekend fallback to the prior trading day), and input
validation.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ledger_sync.api.deps import get_current_user
from ledger_sync.api.stock_price import router as stock_price_router


def _ts(day: str) -> int:
    """UTC midnight timestamp for a YYYY-MM-DD string."""
    return int(datetime.fromisoformat(f"{day}T00:00:00+00:00").astimezone(UTC).timestamp())


def _make_app(yahoo_payload: dict[str, Any]) -> FastAPI:
    app = FastAPI()
    app.include_router(stock_price_router)
    app.dependency_overrides[get_current_user] = lambda: MagicMock(id=1)

    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json = MagicMock(return_value=yahoo_payload)
    app.state.http_client = MagicMock(get=AsyncMock(return_value=response))
    return app


def _latest_payload(price: float, currency: str = "USD") -> dict[str, Any]:
    return {"chart": {"result": [{"meta": {"regularMarketPrice": price, "currency": currency}}]}}


def _historical_payload(
    days: list[str], closes: list[float | None], currency: str = "USD"
) -> dict[str, Any]:
    return {
        "chart": {
            "result": [
                {
                    "meta": {"currency": currency},
                    "timestamp": [_ts(d) for d in days],
                    "indicators": {"quote": [{"close": closes}]},
                }
            ]
        }
    }


def test_latest_price() -> None:
    app = _make_app(_latest_payload(231.44))
    resp = TestClient(app).get("/api/stock-price/AMZN")

    assert resp.status_code == 200
    body = resp.json()
    assert body["symbol"] == "AMZN"
    assert body["price"] == pytest.approx(231.44)
    assert body["as_of"] is None


def test_historical_price_exact_day() -> None:
    app = _make_app(
        _historical_payload(["2025-08-13", "2025-08-14", "2025-08-15"], [100.0, 101.0, 102.5])
    )
    resp = TestClient(app).get("/api/stock-price/AMZN", params={"on_date": "2025-08-15"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["price"] == pytest.approx(102.5)
    assert body["as_of"] == "2025-08-15"


def test_historical_price_weekend_falls_back_to_prior_close() -> None:
    # 2025-08-16 is a Saturday; the last trading day is Friday the 15th.
    app = _make_app(_historical_payload(["2025-08-14", "2025-08-15"], [101.0, 102.5]))
    resp = TestClient(app).get("/api/stock-price/AMZN", params={"on_date": "2025-08-16"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["price"] == pytest.approx(102.5)
    assert body["as_of"] == "2025-08-15"


def test_historical_price_skips_null_closes() -> None:
    app = _make_app(_historical_payload(["2025-08-14", "2025-08-15"], [101.0, None]))
    resp = TestClient(app).get("/api/stock-price/AMZN", params={"on_date": "2025-08-15"})

    assert resp.status_code == 200
    assert resp.json()["price"] == pytest.approx(101.0)
    assert resp.json()["as_of"] == "2025-08-14"


def test_historical_price_no_data_returns_502() -> None:
    app = _make_app(_historical_payload([], []))
    resp = TestClient(app).get("/api/stock-price/AMZN", params={"on_date": "2025-08-15"})

    assert resp.status_code == 502


def test_future_on_date_returns_400() -> None:
    app = _make_app(_latest_payload(1.0))
    resp = TestClient(app).get("/api/stock-price/AMZN", params={"on_date": "2999-01-01"})

    assert resp.status_code == 400


def test_invalid_symbol_returns_400() -> None:
    app = _make_app(_latest_payload(1.0))
    resp = TestClient(app).get("/api/stock-price/THISISWAYTOOLONG")

    assert resp.status_code == 400

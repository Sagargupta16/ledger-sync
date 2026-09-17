"""Provider-only requests finish authentication before waiting on the network."""

import asyncio
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool

from ledger_sync.api import deps, exchange_rates, stock_price
from ledger_sync.core.auth import create_tokens
from ledger_sync.db import session as session_module
from ledger_sync.db.base import Base
from ledger_sync.db.models import User


@pytest.mark.parametrize("provider", ["stock", "exchange"])
@pytest.mark.parametrize("identity_state", ["active", "disabled", "revoked", "missing"])
def test_provider_auth_releases_connection_and_enforces_identity(
    monkeypatch, provider, identity_state
):
    engine = create_engine(
        "sqlite:///:memory:",
        poolclass=QueuePool,
        pool_size=1,
        max_overflow=0,
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as session:
        user = User(email="synthetic@example.test", is_active=True, is_verified=True)
        session.add(user)
        session.commit()
        token = create_tokens(user.id, user.email, user.token_version).access_token
        if identity_state == "disabled":
            user.is_active = False
        elif identity_state == "revoked":
            user.token_version += 1
        elif identity_state == "missing":
            session.delete(user)
        session.commit()
    monkeypatch.setattr(session_module, "SessionLocal", factory)
    monkeypatch.setattr(deps, "SessionLocal", factory, raising=False)
    application = FastAPI()
    upstream_calls = []

    async def fetch(*args, **kwargs):
        upstream_calls.append(provider)
        assert engine.pool.checkedout() == 0
        # A separate authenticated DB operation fits even in a one-connection pool.
        with factory() as other_session:
            assert other_session.scalar(select(User.id)) is not None
        if provider == "exchange":
            return {"USD": 0.01}, "2026-01-01"
        return httpx.Response(
            200,
            request=httpx.Request("GET", "https://synthetic.test"),
            json={"chart": {"result": [{"meta": {"regularMarketPrice": 1, "currency": "USD"}}]}},
        )

    if provider == "exchange":
        application.include_router(exchange_rates.router)
        monkeypatch.setattr(exchange_rates, "_rate_cache", {})
        monkeypatch.setattr(exchange_rates, "_fetch_rates", fetch)
        path = "/api/exchange-rates"
    else:
        application.include_router(stock_price.router)
        application.state.http_client = SimpleNamespace(get=fetch)
        path = "/api/stock-price/TEST"

    async def check():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application), base_url="http://test"
        ) as client:
            response = await client.get(path, headers={"Authorization": f"Bearer {token}"})
        expected = {"active": 200, "disabled": 403, "revoked": 401, "missing": 401}
        assert response.status_code == expected[identity_state]
        assert upstream_calls == ([provider] if identity_state == "active" else [])
        assert engine.pool.checkedout() == 0

    try:
        asyncio.run(check())
    finally:
        engine.dispose()

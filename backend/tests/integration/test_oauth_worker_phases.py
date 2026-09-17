"""Only OAuth DB phases leave the event loop; provider HTTP remains async."""

import asyncio
import threading
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi import FastAPI

from ledger_sync.api import oauth
from ledger_sync.api.rate_limit import limiter
from ledger_sync.db.session import get_session
from ledger_sync.schemas.auth import Token


@pytest.mark.parametrize("provider", ["google", "github"])
def test_oauth_database_phases_use_workers(monkeypatch, provider):
    calls = []
    monkeypatch.setattr(limiter, "enabled", False)
    monkeypatch.setattr(oauth.settings, f"{provider}_client_id", "synthetic-client")
    monkeypatch.setattr(oauth.settings, f"{provider}_client_secret", "synthetic-secret")

    def validate(*args):
        calls.append(("validate", threading.get_ident()))

    def login(_service, **kwargs):
        calls.append(("login", threading.get_ident()))
        return Token.model_validate(
            {"access_token": "synthetic-access", "refresh_token": "synthetic-refresh"}
        )

    async def post(url, **kwargs):
        calls.append(("http", threading.get_ident()))
        return httpx.Response(
            200, request=httpx.Request("POST", url), json={"access_token": "synthetic"}
        )

    async def get(url, **kwargs):
        if url.endswith("/emails"):
            data = [{"email": "synthetic@example.test", "primary": True, "verified": True}]
        else:
            data = {"id": "synthetic", "email": "synthetic@example.test", "verified_email": True}
        return httpx.Response(200, request=httpx.Request("GET", url), json=data)

    monkeypatch.setattr(oauth, "_validate_state", validate)
    monkeypatch.setattr(oauth.AuthService, "oauth_login_or_register", login)
    application = FastAPI()
    application.include_router(oauth.router)
    application.state.http_client = SimpleNamespace(post=post, get=get)
    application.dependency_overrides[get_session] = lambda: MagicMock()

    async def check():
        loop_thread = threading.get_ident()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application), base_url="http://test"
        ) as client:
            response = await client.post(
                f"/api/auth/oauth/{provider}/callback",
                json={"code": "synthetic", "state": "synthetic", "code_verifier": "a" * 43},
            )
        assert response.status_code == 200
        assert [phase for phase, _ in calls] == ["validate", "http", "login"]
        assert all((thread == loop_thread) == (phase == "http") for phase, thread in calls)

    asyncio.run(check())

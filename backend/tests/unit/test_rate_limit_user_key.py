"""Tests for the per-authenticated-user rate limit key function."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from ledger_sync.api import rate_limit
from ledger_sync.api.rate_limit import _user_key_func, limiter, user_limiter
from ledger_sync.core.auth.tokens import create_tokens

# Synthetic test IPs -- never leave the test suite. Documented for reviewers so
# Sonar's S1313 hardcoded-IP checks understand these aren't leaked prod IPs.
_DEFAULT_FAKE_IP = "1.2.3.4"  # NOSONAR
_FAKE_IP_NO_AUTH = "10.0.0.5"  # NOSONAR
_FAKE_IP_MALFORMED_JWT = "10.0.0.6"  # NOSONAR
_FAKE_IP_NON_BEARER = "10.0.0.7"  # NOSONAR


def _fake_request(headers: dict[str, str], client_host: str = _DEFAULT_FAKE_IP) -> MagicMock:
    req = MagicMock()
    req.headers = headers
    req.client = MagicMock(host=client_host)
    return req


def test_user_key_func_returns_sub_from_bearer_token():
    tokens = create_tokens(user_id=42, email="a@b.c", token_version=0)
    req = _fake_request({"authorization": f"Bearer {tokens.access_token}"})

    assert _user_key_func(req) == "user:42"


def test_user_key_func_falls_back_to_ip_without_token():
    req = _fake_request(headers={}, client_host=_FAKE_IP_NO_AUTH)

    assert _user_key_func(req) == _FAKE_IP_NO_AUTH


def test_user_key_func_falls_back_to_ip_with_malformed_token():
    req = _fake_request(
        {"authorization": "Bearer not.a.valid.jwt"},
        client_host=_FAKE_IP_MALFORMED_JWT,
    )

    assert _user_key_func(req) == _FAKE_IP_MALFORMED_JWT


def test_user_key_func_falls_back_to_ip_with_non_bearer_scheme():
    """Basic Auth or any other scheme should not be parsed as a JWT."""
    req = _fake_request(
        {"authorization": "Basic dXNlcjpwYXNz"},
        client_host=_FAKE_IP_NON_BEARER,
    )

    assert _user_key_func(req) == _FAKE_IP_NON_BEARER


def test_user_key_func_case_insensitive_bearer_prefix():
    """Some clients send 'bearer' or 'BEARER' -- accept both."""
    tokens = create_tokens(user_id=99, email="b@c.d", token_version=0)
    req_lower = _fake_request({"authorization": f"bearer {tokens.access_token}"})
    req_upper = _fake_request({"authorization": f"BEARER {tokens.access_token}"})

    assert _user_key_func(req_lower) == "user:99"
    assert _user_key_func(req_upper) == "user:99"


@user_limiter.limit("2/minute")
@limiter.limit("3/minute")
def _limited_endpoint(request: Request) -> dict[str, bool]:
    return {"ok": True}


def _limited_app(monkeypatch: pytest.MonkeyPatch) -> FastAPI:
    monkeypatch.setattr(
        rate_limit,
        "decode_token",
        lambda value: SimpleNamespace(sub=value, type="access"),
    )
    limiter.reset()
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.get("/limited")(_limited_endpoint)
    return app


def test_stacked_limits_enforce_ip_across_distinct_users(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = TestClient(_limited_app(monkeypatch))
    statuses = [
        client.get("/limited", headers={"Authorization": f"Bearer {identity}"}).status_code
        for identity in ("one", "two", "one", "two")
    ]

    assert statuses == [200, 200, 200, 429]


def test_stacked_limits_enforce_user_across_distinct_ips(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = _limited_app(monkeypatch)
    first = TestClient(app, client=("192.0.2.1", 40001))
    second = TestClient(app, client=("192.0.2.2", 40002))
    auth = {"Authorization": "Bearer one"}

    assert first.get("/limited", headers=auth).status_code == 200
    assert second.get("/limited", headers=auth).status_code == 200
    assert second.get("/limited", headers=auth).status_code == 429
    assert first.get("/limited", headers={"Authorization": "Bearer two"}).status_code == 200

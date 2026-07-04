"""Tests for the per-authenticated-user rate limit key function."""

from __future__ import annotations

from unittest.mock import MagicMock

from ledger_sync.api.rate_limit import _user_key_func
from ledger_sync.core.auth.tokens import create_tokens


def _fake_request(headers: dict[str, str], client_host: str = "1.2.3.4") -> MagicMock:
    req = MagicMock()
    req.headers = headers
    req.client = MagicMock(host=client_host)
    return req


def test_user_key_func_returns_sub_from_bearer_token():
    tokens = create_tokens(user_id=42, email="a@b.c", token_version=0)
    req = _fake_request({"authorization": f"Bearer {tokens.access_token}"})

    assert _user_key_func(req) == "user:42"


def test_user_key_func_falls_back_to_ip_without_token():
    req = _fake_request(headers={}, client_host="10.0.0.5")

    assert _user_key_func(req) == "10.0.0.5"


def test_user_key_func_falls_back_to_ip_with_malformed_token():
    req = _fake_request(
        {"authorization": "Bearer not.a.valid.jwt"},
        client_host="10.0.0.6",
    )

    assert _user_key_func(req) == "10.0.0.6"


def test_user_key_func_falls_back_to_ip_with_non_bearer_scheme():
    """Basic Auth or any other scheme should not be parsed as a JWT."""
    req = _fake_request(
        {"authorization": "Basic dXNlcjpwYXNz"},
        client_host="10.0.0.7",
    )

    assert _user_key_func(req) == "10.0.0.7"


def test_user_key_func_case_insensitive_bearer_prefix():
    """Some clients send 'bearer' or 'BEARER' -- accept both."""
    tokens = create_tokens(user_id=99, email="b@c.d", token_version=0)
    req_lower = _fake_request({"authorization": f"bearer {tokens.access_token}"})
    req_upper = _fake_request({"authorization": f"BEARER {tokens.access_token}"})

    assert _user_key_func(req_lower) == "user:99"
    assert _user_key_func(req_upper) == "user:99"

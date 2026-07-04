"""Tests for token_version-based session revocation."""

from __future__ import annotations

from ledger_sync.core.auth.tokens import create_tokens, verify_token


def test_new_tokens_encode_tv_claim():
    tokens = create_tokens(user_id=42, email="a@b.c", token_version=7)
    data = verify_token(tokens.access_token, expected_tv=7)
    assert data is not None
    assert data.user_id == 42


def test_bumped_token_version_invalidates_old_tokens():
    tokens = create_tokens(user_id=42, email="a@b.c", token_version=0)
    # Baseline: same tv, passes.
    assert verify_token(tokens.access_token, expected_tv=0) is not None
    # Simulate a logout that bumped token_version to 1.
    assert verify_token(tokens.access_token, expected_tv=1) is None


def test_missing_tv_soft_accepted_as_zero(monkeypatch):
    """Legacy tokens issued before this migration carry no tv claim.

    During the rollout window (jwt_strict_tv=false, the default), those
    tokens must still validate against expected_tv=0 -- otherwise every
    active session would break the day this code deploys.
    """
    from datetime import UTC, datetime, timedelta

    import jwt as pyjwt

    from ledger_sync.config.settings import settings

    legacy_payload = {
        "sub": "42",
        "email": "a@b.c",
        "exp": datetime.now(UTC) + timedelta(minutes=30),
        "type": "access",
    }
    legacy = pyjwt.encode(legacy_payload, settings.jwt_secret_key, algorithm="HS256")

    monkeypatch.setattr(settings, "jwt_strict_tv", False)
    data = verify_token(legacy, expected_tv=0)
    assert data is not None
    # But mismatched expected_tv still fails.
    assert verify_token(legacy, expected_tv=1) is None


def test_missing_tv_rejected_in_strict_mode(monkeypatch):
    """After day-8 flip, legacy tokens without tv must be rejected."""
    from datetime import UTC, datetime, timedelta

    import jwt as pyjwt

    from ledger_sync.config.settings import settings

    legacy_payload = {
        "sub": "42",
        "email": "a@b.c",
        "exp": datetime.now(UTC) + timedelta(minutes=30),
        "type": "access",
    }
    legacy = pyjwt.encode(legacy_payload, settings.jwt_secret_key, algorithm="HS256")

    monkeypatch.setattr(settings, "jwt_strict_tv", True)
    assert verify_token(legacy, expected_tv=0) is None


def test_verify_token_without_expected_tv_still_works():
    """Callers that don't yet pass expected_tv keep working (legacy call sites)."""
    tokens = create_tokens(user_id=42, email="a@b.c", token_version=3)
    data = verify_token(tokens.access_token)  # no expected_tv
    assert data is not None
    assert data.user_id == 42

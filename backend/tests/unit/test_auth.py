"""Tests for authentication logic."""

import base64
import hashlib
from unittest.mock import Mock
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import update

from ledger_sync.api import oauth
from ledger_sync.api.deps import get_http_client
from ledger_sync.api.main import app
from ledger_sync.core.auth.passwords import get_password_hash, verify_password
from ledger_sync.core.auth.tokens import create_access_token, create_refresh_token, verify_token
from ledger_sync.db.models import AuditLog, User
from ledger_sync.schemas.auth import Token
from ledger_sync.services.auth_service import AuthService


class TestPasswords:
    """Test password hashing and verification."""

    def test_hash_and_verify_correct_password(self):
        password = "test-password-123"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True

    def test_verify_wrong_password(self):
        password = "test-password-123"
        hashed = get_password_hash(password)
        assert verify_password("wrong-password", hashed) is False

    def test_hash_is_not_plaintext(self):
        password = "test-password-123"
        hashed = get_password_hash(password)
        assert hashed != password

    def test_different_passwords_different_hashes(self):
        hash1 = get_password_hash("password1")
        hash2 = get_password_hash("password2")
        assert hash1 != hash2

    def test_same_password_different_hashes(self):
        """Bcrypt should produce different hashes for the same password (different salts)."""
        hash1 = get_password_hash("same-password")
        hash2 = get_password_hash("same-password")
        assert hash1 != hash2


class TestTokens:
    """Test JWT token creation and verification."""

    def test_create_and_verify_access_token(self):
        token = create_access_token(data={"sub": "1", "email": "test@example.com"})
        assert token is not None
        assert isinstance(token, str)

        data = verify_token(token, token_type="access")
        assert data is not None
        assert data.user_id == 1
        assert data.email == "test@example.com"

    def test_create_and_verify_refresh_token(self):
        token = create_refresh_token(data={"sub": "1", "email": "test@example.com"})
        assert token is not None

        data = verify_token(token, token_type="refresh")
        assert data is not None
        assert data.user_id == 1

    def test_access_token_rejected_as_refresh(self):
        token = create_access_token(data={"sub": "1", "email": "test@example.com"})
        data = verify_token(token, token_type="refresh")
        assert data is None

    def test_refresh_token_rejected_as_access(self):
        token = create_refresh_token(data={"sub": "1", "email": "test@example.com"})
        data = verify_token(token, token_type="access")
        assert data is None

    def test_invalid_token_returns_none(self):
        data = verify_token("invalid.token.string", token_type="access")
        assert data is None

    def test_empty_token_returns_none(self):
        data = verify_token("", token_type="access")
        assert data is None


@pytest.fixture
def token_stub(monkeypatch):
    tokens = Token(access_token="synthetic-access", refresh_token="synthetic-refresh")
    stub = Mock(return_value=tokens)
    monkeypatch.setattr("ledger_sync.services.auth_service.create_tokens", stub)
    return stub


class TestOAuthIdentity:
    @pytest.mark.parametrize(
        ("bound_provider", "bound_id"),
        [
            ("google", "original-subject"),
            ("github", "original-subject"),
            ("google", None),
            (None, "original-subject"),
            ("", ""),
        ],
    )
    def test_email_never_rebinds_an_existing_identity(
        self, test_db_session, test_user, token_stub, bound_provider, bound_id
    ):
        test_user.auth_provider = bound_provider
        test_user.auth_provider_id = bound_id
        test_db_session.commit()

        with pytest.raises(HTTPException) as error:
            AuthService(test_db_session).oauth_login_or_register(
                email=test_user.email,
                full_name=None,
                provider="google",
                provider_id="another-subject",
            )

        assert error.value.status_code == 409
        test_db_session.refresh(test_user)
        assert (test_user.auth_provider, test_user.auth_provider_id) == (bound_provider, bound_id)
        token_stub.assert_not_called()

    def test_verified_email_can_link_a_fully_unbound_legacy_account(
        self, test_db_session, test_user, token_stub
    ):
        result = AuthService(test_db_session).oauth_login_or_register(
            email=test_user.email,
            full_name=None,
            provider="google",
            provider_id="legacy-subject",
        )
        assert result == token_stub.return_value
        assert test_user.auth_provider == "google"
        assert test_user.auth_provider_id == "legacy-subject"
        assert test_db_session.query(User).count() == 1

    def test_same_subject_remains_authoritative_after_email_changes(
        self, test_db_session, test_user, token_stub
    ):
        test_user.auth_provider = "google"
        test_user.auth_provider_id = "same-subject"
        test_db_session.commit()
        AuthService(test_db_session).oauth_login_or_register(
            email="changed@example.invalid",
            full_name=None,
            provider="google",
            provider_id="same-subject",
        )
        token_stub.assert_called_once_with(test_user.id, test_user.email, test_user.token_version)
        assert test_db_session.query(User).count() == 1

    def test_missing_subject_cannot_link_a_legacy_account(
        self, test_db_session, test_user, token_stub
    ):
        with pytest.raises(HTTPException) as error:
            AuthService(test_db_session).oauth_login_or_register(
                email=test_user.email, full_name=None, provider="google", provider_id=""
            )
        assert error.value.status_code == 400
        assert test_user.auth_provider is None
        token_stub.assert_not_called()

    def test_inactive_account_is_not_linked(self, test_db_session, test_user, token_stub):
        test_user.is_active = False
        test_db_session.commit()
        with pytest.raises(HTTPException) as error:
            AuthService(test_db_session).oauth_login_or_register(
                email=test_user.email,
                full_name=None,
                provider="google",
                provider_id="inactive-subject",
            )
        assert error.value.status_code == 403
        assert test_user.auth_provider is None
        token_stub.assert_not_called()

    def test_concurrent_legacy_binding_cannot_overwrite_a_winner(
        self, test_db_session, test_user, token_stub, monkeypatch
    ):
        service = AuthService(test_db_session)
        monkeypatch.setattr(service, "_get_user_by_email", lambda _email: test_user)
        # Keep this session's legacy identity stale while another claim wins in SQL.
        test_db_session.execute(
            update(User)
            .where(User.id == test_user.id)
            .values(auth_provider="github", auth_provider_id="winning-subject")
            .execution_options(synchronize_session=False)
        )
        with pytest.raises(HTTPException) as error:
            service.oauth_login_or_register(
                email=test_user.email,
                full_name=None,
                provider="google",
                provider_id="losing-subject",
            )
        assert error.value.status_code == 409
        test_db_session.refresh(test_user)
        assert test_user.auth_provider_id == "winning-subject"
        token_stub.assert_not_called()


@pytest.fixture
def oauth_client(two_user_client, monkeypatch, token_stub):
    from unittest.mock import AsyncMock

    client, session, *_ = two_user_client
    monkeypatch.setattr(oauth.settings, "google_client_id", "synthetic-google")
    monkeypatch.setattr(oauth.settings, "google_client_secret", "synthetic-google-secret")
    monkeypatch.setattr(oauth.settings, "github_client_id", "synthetic-github")
    monkeypatch.setattr(oauth.settings, "github_client_secret", "synthetic-github-secret")
    monkeypatch.setattr(oauth.settings, "frontend_url", "https://example.invalid/ledger-sync")
    monkeypatch.setattr(oauth.limiter, "enabled", False)

    async def profile(url, **_kwargs):
        if url == oauth._GITHUB_EMAILS_URL:
            return httpx.Response(
                200,
                json=[{"email": "verified@example.invalid", "primary": True, "verified": True}],
            )
        return httpx.Response(
            200,
            json={
                "id": "synthetic-subject",
                "email": "profile@example.invalid",
                "verified_email": True,
            },
        )

    provider_client = Mock(
        post=AsyncMock(
            return_value=httpx.Response(200, json={"access_token": "synthetic-provider"})
        ),
        get=AsyncMock(side_effect=profile),
    )
    app.dependency_overrides[get_http_client] = lambda: provider_client
    yield client, session, provider_client, token_stub


def _start_oauth(client, provider="google"):
    verifier = "a" * 64
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    )
    response = client.post(
        f"/api/auth/oauth/{provider}/authorize", json={"code_challenge": challenge}
    )
    assert response.status_code == 200, response.text
    authorization = response.json()
    assert authorization["code_challenge_method"] == "S256"
    assert authorization["code_challenge"] == challenge
    assert (
        authorization["redirect_uri"]
        == f"https://example.invalid/ledger-sync/auth/callback/{provider}"
    )
    assert "code_verifier" not in authorization
    return {"code": "synthetic-code", "state": authorization["state"], "code_verifier": verifier}


class TestOAuthFlow:
    def test_initiation_supports_cross_origin_json_without_cookies(self, oauth_client):
        client, session, _provider_client, _token_stub = oauth_client
        origin = "http://localhost:5173"
        preflight = client.options(
            "/api/auth/oauth/google/authorize",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == origin
        providers = client.get("/api/auth/oauth/providers?flow_version=2")
        assert all("state" not in provider for provider in providers.json())
        assert all(provider["flow_version"] == 2 for provider in providers.json())
        assert session.query(AuditLog).filter_by(operation="oauth_login").count() == 0
        _start_oauth(client)
        assert not client.cookies

    @pytest.mark.parametrize("provider", ["google", "github"])
    def test_exchange_uses_pkce_and_consumes_state_once(self, oauth_client, provider):
        client, session, provider_client, token_stub = oauth_client
        body = _start_oauth(client, provider)
        response = client.post(f"/api/auth/oauth/{provider}/callback", json=body)
        assert response.status_code == 200, response.text
        assert (
            provider_client.post.call_args.kwargs["data"]["code_verifier"] == body["code_verifier"]
        )
        assert session.query(AuditLog).filter_by(operation="oauth_login").one().action == "consumed"
        if provider == "github":
            assert token_stub.call_args.args[1] == "verified@example.invalid"

        replay = client.post(
            f"/api/auth/oauth/{provider}/callback", json={**body, "code": "another-code"}
        )
        assert replay.status_code == 400
        assert "already used" in replay.json()["detail"]
        provider_client.post.assert_called_once()
        token_stub.assert_called_once()

    @pytest.mark.parametrize("mismatch", ["browser", "provider", "signature", "redirect"])
    def test_mismatch_never_contacts_provider(self, oauth_client, monkeypatch, mismatch):
        client, _session, provider_client, token_stub = oauth_client
        body = _start_oauth(client)
        provider = "google"
        if mismatch == "browser":
            body["code_verifier"] = "b" * 64
        elif mismatch == "provider":
            provider = "github"
        elif mismatch == "signature":
            body["state"] += "x"
        else:
            monkeypatch.setattr(oauth.settings, "frontend_url", "https://different.example.invalid")

        response = client.post(f"/api/auth/oauth/{provider}/callback", json=body)
        assert response.status_code == 400
        provider_client.post.assert_not_called()
        token_stub.assert_not_called()

    def test_expired_state_never_contacts_provider(self, oauth_client, monkeypatch):
        client, _session, provider_client, token_stub = oauth_client
        body = _start_oauth(client)
        expiry = int(body["state"].split(".")[-2])
        monkeypatch.setattr(oauth.time, "time", lambda: expiry)
        response = client.post("/api/auth/oauth/google/callback", json=body)
        assert response.status_code == 400
        assert "expired" in response.json()["detail"]
        provider_client.post.assert_not_called()
        token_stub.assert_not_called()

    def test_provider_failure_does_not_restore_consumed_state(self, oauth_client):
        client, _session, provider_client, token_stub = oauth_client
        body = _start_oauth(client)
        provider_client.post.return_value = httpx.Response(400, json={"error": "invalid_grant"})
        assert client.post("/api/auth/oauth/google/callback", json=body).status_code == 400
        response = client.post("/api/auth/oauth/google/callback", json=body)
        assert response.status_code == 400
        assert "already used" in response.json()["detail"]
        provider_client.post.assert_called_once()
        token_stub.assert_not_called()

    @pytest.mark.parametrize("missing", ["code", "state", "code_verifier"])
    def test_callback_requires_code_state_and_proof(self, oauth_client, missing):
        client, _session, provider_client, _token_stub = oauth_client
        body = _start_oauth(client)
        del body[missing]
        expected_status = 409 if missing == "code_verifier" else 422
        response = client.post("/api/auth/oauth/google/callback", json=body)
        assert response.status_code == expected_status
        provider_client.post.assert_not_called()

    @pytest.mark.parametrize("provider", ["google", "github"])
    def test_old_provider_builder_navigates_to_a_fresh_versioned_flow(self, oauth_client, provider):
        client, session, provider_client, token_stub = oauth_client
        configs = client.get("/api/auth/oauth/providers").json()
        config = next(item for item in configs if item["provider"] == provider)
        # Match HEAD AuthModal's URLSearchParams and authorize_url concatenation.
        query = urlencode(
            {
                "client_id": config["client_id"],
                "redirect_uri": "https://untrusted.example.invalid",
                "scope": config["scope"],
                "response_type": "code",
                "state": config["state"],
            }
        )
        restart = client.get(f"{config['authorize_url']}?{query}", follow_redirects=False)
        assert restart.status_code == 303
        target = urlsplit(restart.headers["location"])
        assert target.scheme == "https"
        assert target.netloc == "example.invalid"
        assert target.path == f"/ledger-sync/auth/callback/{provider}"
        parameters = parse_qs(target.query)
        assert parameters["restart"] == ["2"]
        assert parameters["error"] == [oauth._UPGRADE_MESSAGE]
        assert parameters["reload"]
        assert "code" not in parameters and "state" not in parameters
        assert restart.headers["cache-control"] == "no-store"
        assert not client.cookies
        assert session.query(AuditLog).filter_by(operation="oauth_login").count() == 0
        provider_client.post.assert_not_called()
        token_stub.assert_not_called()

        # A refreshed client still has to initiate and prove a new S256 attempt.
        body = _start_oauth(client, provider)
        response = client.post(f"/api/auth/oauth/{provider}/callback", json=body)
        assert response.status_code == 200
        provider_client.post.assert_called_once()

    @pytest.mark.parametrize("provider", ["google", "github"])
    def test_old_callback_gets_a_readable_upgrade_error_without_authentication(
        self, oauth_client, provider
    ):
        client, session, provider_client, token_stub = oauth_client
        response = client.post(
            f"/api/auth/oauth/{provider}/callback",
            json={"code": "old-code", "state": "old-unbound-state"},
        )
        assert response.status_code == 409
        assert response.json()["detail"] == oauth._UPGRADE_MESSAGE
        assert session.query(AuditLog).filter_by(operation="oauth_login").count() == 0
        provider_client.post.assert_not_called()
        token_stub.assert_not_called()

    def test_restart_marker_cannot_be_used_as_authorization_state(self, oauth_client):
        client, _session, provider_client, token_stub = oauth_client
        response = client.post(
            "/api/auth/oauth/google/callback",
            json={
                "code": "old-code",
                "state": "oauth-upgrade-v2",
                "code_verifier": "a" * 64,
            },
        )
        assert response.status_code == 400
        provider_client.post.assert_not_called()
        token_stub.assert_not_called()

    @pytest.mark.parametrize(
        ("content", "content_type"), [("", "application/json"), ("invalid", "text/plain")]
    )
    def test_upgrade_check_preserves_invalid_body_validation(
        self, oauth_client, content, content_type
    ):
        client, _session, provider_client, token_stub = oauth_client
        response = client.post(
            "/api/auth/oauth/google/callback",
            content=content,
            headers={"Content-Type": content_type},
        )
        assert response.status_code == 422
        provider_client.post.assert_not_called()
        token_stub.assert_not_called()

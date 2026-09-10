"""OAuth authentication endpoints (Google, GitHub).

Handles the server-side of the OAuth authorization code flow:
1. Frontend starts a sign-in with a PKCE challenge and retains the verifier.
2. Provider redirects back to frontend with an authorization code.
3. Frontend sends the code to POST /api/auth/oauth/{provider}/callback.
4. Backend exchanges the code for provider tokens, fetches user profile,
   then creates/links a local user and returns JWT tokens.
"""

import base64
import hashlib
import hmac
import logging
import secrets
import time
from datetime import UTC, datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from ledger_sync.api.deps import DatabaseSession, HttpClient
from ledger_sync.api.rate_limit import limiter
from ledger_sync.config.settings import settings
from ledger_sync.db.models import AuditLog
from ledger_sync.schemas.auth import (
    OAuthAuthorization,
    OAuthCallbackRequest,
    OAuthInitiationRequest,
    OAuthProviderConfig,
    OAuthRestartConfig,
    Token,
)
from ledger_sync.services.auth_service import AuthService

logger = logging.getLogger("ledger_sync.oauth")

router = APIRouter(prefix="/api/auth/oauth", tags=["oauth"])

# ─── Provider Configurations ──────────────────────────────────────────────────

_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
_GOOGLE_SCOPES = "openid email profile"

_GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
_GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
_GITHUB_USER_URL = "https://api.github.com/user"
_GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
_GITHUB_SCOPES = "read:user user:email"

_GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"

# State is signed and bound to the provider, redirect, and browser-held verifier.
# Audit records make consumption atomic across serverless instances without cookies.

_STATE_TTL = 600  # 10 minutes
_STATE_OPERATION = "oauth_login"
_STATE_ENTITY = "oauth_state"
_UPGRADE_MESSAGE = (
    "Sign-in was updated. Refresh this page, then choose Sign in to start a new secure attempt."
)


def _state_secret() -> bytes:
    """Key used to sign state tokens (the server's JWT secret)."""
    return settings.jwt_secret_key.encode()


def _sign_state(payload: str) -> str:
    """Return the base64url HMAC-SHA256 of a state payload."""
    digest = hmac.new(_state_secret(), payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def _generate_state(provider: str, code_challenge: str, session: Session) -> str:
    """Record a short-lived initiation and sign its browser/provider binding."""
    now = int(time.time())
    cutoff = datetime.fromtimestamp(now - _STATE_TTL, UTC).replace(tzinfo=None)
    session.execute(
        delete(AuditLog).where(
            AuditLog.operation == _STATE_OPERATION,
            AuditLog.entity_type == _STATE_ENTITY,
            AuditLog.user_id.is_(None),
            AuditLog.created_at <= cutoff,
        )
    )
    nonce = secrets.token_urlsafe(24)
    attempt = AuditLog(
        operation=_STATE_OPERATION,
        entity_type=_STATE_ENTITY,
        entity_id=nonce,
        action="pending",
        created_at=datetime.fromtimestamp(now, UTC).replace(tzinfo=None),
    )
    session.add(attempt)
    session.flush()
    payload = f"{attempt.id}.{nonce}.{provider}.{code_challenge}.{now + _STATE_TTL}"
    signature = _sign_state(f"{payload}.{_get_redirect_uri(provider)}")
    session.commit()
    return f"{payload}.{signature}"


def _validate_state(body: OAuthCallbackRequest, provider: str, session: Session) -> None:
    """Validate browser proof and consume this attempt before any provider call."""
    try:
        attempt_id, nonce, state_provider, challenge, expiry, signature = body.state.split(".")
        record_id = int(attempt_id)
        expires_at = int(expiry)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid sign-in attempt. Please start sign-in again.",
        ) from None

    payload = body.state.rsplit(".", 1)[0]
    expected_signature = _sign_state(f"{payload}.{_get_redirect_uri(provider)}")
    expected_challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(body.code_verifier.encode("ascii")).digest())
        .decode()
        .rstrip("=")
    )
    if (
        state_provider != provider
        or not hmac.compare_digest(signature, expected_signature)
        or not hmac.compare_digest(challenge, expected_challenge)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sign-in does not match this browser or provider. Please start again.",
        )
    if int(time.time()) >= expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This sign-in attempt has expired. Please start sign-in again.",
        )

    consumed_id = session.execute(
        update(AuditLog)
        .where(
            AuditLog.id == record_id,
            AuditLog.operation == _STATE_OPERATION,
            AuditLog.entity_type == _STATE_ENTITY,
            AuditLog.user_id.is_(None),
            AuditLog.entity_id == nonce,
            AuditLog.action == "pending",
        )
        .values(action="consumed")
        .returning(AuditLog.id)
    ).scalar_one_or_none()
    if consumed_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This sign-in attempt was already used. Please start sign-in again.",
        )
    # Commit independently of token exchange so failures cannot resurrect state.
    session.commit()


def _get_redirect_uri(provider: str) -> str:
    """Build the OAuth redirect URI that points to the frontend callback page."""
    return f"{settings.frontend_url.rstrip('/')}/auth/callback/{provider}"


# ─── Provider Config Endpoint ─────────────────────────────────────────────────


def _configured_providers() -> list[OAuthProviderConfig]:
    """Build enabled providers without creating an authentication attempt."""
    providers: list[OAuthProviderConfig] = []

    if settings.google_client_id and settings.google_client_secret:
        providers.append(
            OAuthProviderConfig(
                provider="google",
                client_id=settings.google_client_id,
                authorize_url=_GOOGLE_AUTHORIZE_URL,
                scope=_GOOGLE_SCOPES,
                redirect_uri=_get_redirect_uri("google"),
            )
        )

    if settings.github_client_id and settings.github_client_secret:
        providers.append(
            OAuthProviderConfig(
                provider="github",
                client_id=settings.github_client_id,
                authorize_url=_GITHUB_AUTHORIZE_URL,
                scope=_GITHUB_SCOPES,
                redirect_uri=_get_redirect_uri("github"),
            )
        )

    return providers


@router.get("/providers")
def get_oauth_providers(
    request: Request,
    flow_version: Annotated[Literal["2"] | None, Query()] = None,
) -> list[OAuthProviderConfig | OAuthRestartConfig]:
    """Version 2 uses PKCE; old clients receive navigation-only restart URLs."""
    providers = _configured_providers()
    if flow_version == "2":
        return providers
    return [
        OAuthRestartConfig(
            **{
                **provider.model_dump(),
                "authorize_url": str(request.url_for("restart_oauth", provider=provider.provider)),
            }
        )
        for provider in providers
    ]


@router.get("/v2/{provider}/restart")
def restart_oauth(provider: Literal["google", "github"]) -> RedirectResponse:
    """Load the current frontend before starting a new browser-bound attempt."""
    query = urlencode(
        {
            "restart": "2",
            # HEAD clients understand error, show it as a toast, and return home.
            # This also gives recovery guidance if an old PWA shell is still active.
            "error": _UPGRADE_MESSAGE,
            "reload": secrets.token_urlsafe(12),
        }
    )
    return RedirectResponse(
        f"{_get_redirect_uri(provider)}?{query}",
        status_code=status.HTTP_303_SEE_OTHER,
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


async def _require_pkce_client(request: Request) -> None:
    """Give old callbacks actionable recovery before required-field validation."""
    try:
        body = await request.json()
    except ValueError:
        # Leave malformed or absent JSON to FastAPI's request validation.
        return
    if isinstance(body, dict) and body.get("code_verifier") is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_UPGRADE_MESSAGE)


@router.post("/{provider}/authorize")
@limiter.limit("20/minute")
def initiate_oauth(
    request: Request,
    provider: Literal["google", "github"],
    body: OAuthInitiationRequest,
    session: DatabaseSession,
) -> OAuthAuthorization:
    """Start a cookie-free sign-in bound to a browser-held PKCE verifier."""
    config = next((p for p in _configured_providers() if p.provider == provider), None)
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"{provider.capitalize()} OAuth is not configured",
        )
    return OAuthAuthorization(
        **config.model_dump(),
        state=_generate_state(provider, body.code_challenge, session),
        code_challenge=body.code_challenge,
        expires_in=_STATE_TTL,
    )


# ─── Shared helpers ───────────────────────────────────────────────────────────


async def _oauth_get(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    error_detail: str = "OAuth request failed",
) -> dict[str, Any]:
    """GET with standard error handling for OAuth APIs."""
    resp = await client.get(url, headers=headers)
    if resp.status_code != 200:
        logger.warning("%s: %s", error_detail, resp.status_code)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_detail)
    return resp.json()  # type: ignore[no-any-return]


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _provider_identity(user_info: dict[str, Any]) -> str:
    """Require an immutable provider subject before considering verified email."""
    subject = user_info.get("id")
    if isinstance(subject, bool) or not isinstance(subject, (str, int)) or not str(subject).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The sign-in provider did not return a valid account identity.",
        )
    return str(subject)


# ─── Google OAuth ──────────────────────────────────────────────────────────────


@router.post("/google/callback", dependencies=[Depends(_require_pkce_client)])
@limiter.limit("20/minute")
async def google_callback(
    request: Request,
    body: OAuthCallbackRequest,
    session: DatabaseSession,
    client: HttpClient,
) -> Token:
    """Exchange Google authorization code for JWT tokens."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured",
        )

    _validate_state(body, "google", session)
    redirect_uri = _get_redirect_uri("google")

    # Exchange authorization code for tokens
    resp = await client.post(
        _GOOGLE_TOKEN_URL,
        data={
            "code": body.code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": body.code_verifier,
        },
    )
    if resp.status_code != 200:
        # Provider responses can include short-lived codes or internal URLs
        # -- log only the status and the error field (if any), not full body.
        try:
            error_code = resp.json().get("error")
        except ValueError:
            error_code = None
        logger.warning(
            "Google token exchange failed: status=%s error=%s",
            resp.status_code,
            error_code or "unknown",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google token exchange failed",
        )
    access_token = resp.json().get("access_token")
    if not access_token:
        logger.warning("Google OAuth: no access_token in response")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to obtain access token from Google",
        )

    # Fetch user profile
    user_info = await _oauth_get(
        client,
        _GOOGLE_USERINFO_URL,
        headers=_bearer(access_token),
        error_detail="Failed to fetch Google user profile",
    )
    email = user_info.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not retrieve email from Google",
        )
    # Only trust the email as an identity claim if Google verified it.
    # An unverified email must not be allowed to match/link an account.
    if user_info.get("verified_email") is not True:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google email is not verified",
        )

    auth_service = AuthService(session)
    return auth_service.oauth_login_or_register(
        email=email,
        full_name=user_info.get("name"),
        provider="google",
        provider_id=_provider_identity(user_info),
    )


# ─── GitHub OAuth ──────────────────────────────────────────────────────────────


@router.post("/github/callback", dependencies=[Depends(_require_pkce_client)])
@limiter.limit("20/minute")
async def github_callback(
    request: Request,
    body: OAuthCallbackRequest,
    session: DatabaseSession,
    client: HttpClient,
) -> Token:
    """Exchange GitHub authorization code for JWT tokens."""
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="GitHub OAuth is not configured",
        )

    _validate_state(body, "github", session)
    redirect_uri = _get_redirect_uri("github")

    # Exchange authorization code for access token
    resp = await client.post(
        _GITHUB_TOKEN_URL,
        data={
            "code": body.code,
            "client_id": settings.github_client_id,
            "client_secret": settings.github_client_secret,
            "redirect_uri": redirect_uri,
            "code_verifier": body.code_verifier,
        },
        headers={"Accept": "application/json"},
    )
    if resp.status_code != 200:
        try:
            error_code = resp.json().get("error")
        except ValueError:
            error_code = None
        logger.warning(
            "GitHub token exchange failed: status=%s error=%s",
            resp.status_code,
            error_code or "unknown",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub token exchange failed",
        )
    data = resp.json()
    access_token: str | None = data.get("access_token")
    if not access_token:
        logger.warning("GitHub OAuth: no access_token in response: %s", data.get("error"))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to obtain access token from GitHub",
        )

    # Fetch user profile
    user_info = await _oauth_get(
        client,
        _GITHUB_USER_URL,
        headers=_bearer(access_token),
        error_detail="Failed to fetch GitHub user profile",
    )
    # Public profile email has no verification flag. Linking requires verified email.
    email = await _fetch_github_primary_email(client, access_token)

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not retrieve email from GitHub. "
            "Verify your GitHub email and grant email scope, then start sign-in again.",
        )

    auth_service = AuthService(session)
    return auth_service.oauth_login_or_register(
        email=email,
        full_name=user_info.get("name"),
        provider="github",
        provider_id=_provider_identity(user_info),
    )


async def _fetch_github_primary_email(client: httpx.AsyncClient, access_token: str) -> str | None:
    """Fetch primary verified email from GitHub emails API."""
    resp = await client.get(_GITHUB_EMAILS_URL, headers=_bearer(access_token))
    if resp.status_code != 200:
        return None

    emails: list[dict[str, Any]] = resp.json()
    # Prefer primary + verified email
    for entry in emails:
        if entry.get("primary") and entry.get("verified"):
            return entry.get("email")
    # Fallback to any verified email
    for entry in emails:
        if entry.get("verified"):
            return entry.get("email")
    return None

"""OAuth authentication endpoints (Google, GitHub).

Handles the server-side of the OAuth authorization code flow:
1. Frontend opens provider's authorize URL (constructed client-side from config).
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
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request, status

from ledger_sync.api.deps import DatabaseSession, HttpClient
from ledger_sync.api.rate_limit import limiter
from ledger_sync.config.settings import settings
from ledger_sync.schemas.auth import OAuthCallbackRequest, OAuthProviderConfig, Token
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

# ─── CSRF State Token (stateless, HMAC-signed) ───────────────────────────────
# State tokens are self-contained and HMAC-signed with the server secret, so
# they survive across serverless instances (no shared in-memory store to lose
# on cold start) while remaining unforgeable. Format: "<nonce>.<expiry>.<sig>".

_STATE_TTL = 600  # 10 minutes


def _state_secret() -> bytes:
    """Key used to sign state tokens (the server's JWT secret)."""
    return settings.jwt_secret_key.encode()


def _sign_state(payload: str) -> str:
    """Return the base64url HMAC-SHA256 of a state payload."""
    digest = hmac.new(_state_secret(), payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def _generate_state() -> str:
    """Generate a signed, self-expiring state token."""
    nonce = secrets.token_urlsafe(16)
    expiry = str(int(time.time()) + _STATE_TTL)
    payload = f"{nonce}.{expiry}"
    return f"{payload}.{_sign_state(payload)}"


def _validate_state(state: str | None) -> None:
    """Validate a signed state token. Raises 400 if invalid or expired."""
    if not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing OAuth state parameter",
        )
    try:
        nonce, expiry_str, sig = state.split(".")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OAuth state parameter",
        ) from None

    payload = f"{nonce}.{expiry_str}"
    if not hmac.compare_digest(sig, _sign_state(payload)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OAuth state parameter",
        )
    try:
        expired = int(time.time()) > int(expiry_str)
    except ValueError:
        expired = True
    if expired:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expired OAuth state parameter",
        )


def _get_redirect_uri(provider: str) -> str:
    """Build the OAuth redirect URI that points to the frontend callback page."""
    return f"{settings.frontend_url}/auth/callback/{provider}"


# ─── Provider Config Endpoint ─────────────────────────────────────────────────


@router.get("/providers")
def get_oauth_providers() -> list[OAuthProviderConfig]:
    """Return enabled OAuth provider configurations for the frontend."""
    providers: list[OAuthProviderConfig] = []

    if settings.google_client_id:
        providers.append(
            OAuthProviderConfig(
                provider="google",
                client_id=settings.google_client_id,
                authorize_url=_GOOGLE_AUTHORIZE_URL,
                scope=_GOOGLE_SCOPES,
                redirect_uri=_get_redirect_uri("google"),
                state=_generate_state(),
            )
        )

    if settings.github_client_id:
        providers.append(
            OAuthProviderConfig(
                provider="github",
                client_id=settings.github_client_id,
                authorize_url=_GITHUB_AUTHORIZE_URL,
                scope=_GITHUB_SCOPES,
                redirect_uri=_get_redirect_uri("github"),
                state=_generate_state(),
            )
        )

    return providers


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


# ─── Google OAuth ──────────────────────────────────────────────────────────────


@router.post("/google/callback")
@limiter.limit("20/minute")
async def google_callback(
    request: Request,
    body: OAuthCallbackRequest,
    session: DatabaseSession,
    client: HttpClient,
) -> Token:
    """Exchange Google authorization code for JWT tokens."""
    _validate_state(body.state)

    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured",
        )

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
    if not user_info.get("verified_email", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google email is not verified",
        )

    auth_service = AuthService(session)
    return auth_service.oauth_login_or_register(
        email=email,
        full_name=user_info.get("name"),
        provider="google",
        provider_id=str(user_info.get("id", "")),
    )


# ─── GitHub OAuth ──────────────────────────────────────────────────────────────


@router.post("/github/callback")
@limiter.limit("20/minute")
async def github_callback(
    request: Request,
    body: OAuthCallbackRequest,
    session: DatabaseSession,
    client: HttpClient,
) -> Token:
    """Exchange GitHub authorization code for JWT tokens."""
    _validate_state(body.state)

    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="GitHub OAuth is not configured",
        )

    redirect_uri = _get_redirect_uri("github")

    # Exchange authorization code for access token
    resp = await client.post(
        _GITHUB_TOKEN_URL,
        data={
            "code": body.code,
            "client_id": settings.github_client_id,
            "client_secret": settings.github_client_secret,
            "redirect_uri": redirect_uri,
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
    email = user_info.get("email")

    # GitHub may not include email in profile — fetch from emails API
    if not email:
        email = await _fetch_github_primary_email(client, access_token)

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not retrieve email from GitHub. "
            "Ensure your GitHub email is public or grant email scope.",
        )

    auth_service = AuthService(session)
    return auth_service.oauth_login_or_register(
        email=email,
        full_name=user_info.get("name"),
        provider="github",
        provider_id=str(user_info.get("id", "")),
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

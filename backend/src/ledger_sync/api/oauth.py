"""OAuth authentication endpoints (Google, GitHub).

Handles the server-side of the OAuth authorization code flow:
1. Frontend opens provider's authorize URL (constructed client-side from config).
2. Provider redirects back to frontend with an authorization code.
3. Frontend sends the code to POST /api/auth/oauth/{provider}/callback.
4. Backend exchanges the code for provider tokens, fetches user profile,
   then creates/links a local user and returns JWT tokens.
"""

import logging
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from ledger_sync.api.deps import DatabaseSession
from ledger_sync.config.settings import settings
from ledger_sync.schemas.auth import OAuthCallbackRequest, OAuthProviderConfig, Token
from ledger_sync.services.auth_service import AuthService

logger = logging.getLogger("ledger_sync.oauth")

router = APIRouter(prefix="/api/auth/oauth", tags=["oauth"])

limiter = Limiter(key_func=get_remote_address)

# ─── Provider Configurations ──────────────────────────────────────────────────

_GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
_GOOGLE_SCOPES = "openid email profile"

_GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
_GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
_GITHUB_USER_URL = "https://api.github.com/user"
_GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
_GITHUB_SCOPES = "read:user user:email"


def _get_redirect_uri(provider: str) -> str:
    """Build the OAuth redirect URI that points to the frontend callback page."""
    return f"{settings.frontend_url}/auth/callback/{provider}"


# ─── Provider Config Endpoint ─────────────────────────────────────────────────


@router.get("/providers")
def get_oauth_providers() -> list[OAuthProviderConfig]:
    """Return enabled OAuth provider configurations for the frontend.

    The frontend uses these to build the correct authorize URL.
    Only returns providers that have client_id configured.
    """
    providers: list[OAuthProviderConfig] = []

    if settings.google_client_id:
        redirect_uri = _get_redirect_uri("google")
        providers.append(
            OAuthProviderConfig(
                provider="google",
                client_id=settings.google_client_id,
                authorize_url=_GOOGLE_AUTHORIZE_URL,
                scope=_GOOGLE_SCOPES,
                redirect_uri=redirect_uri,
            )
        )

    if settings.github_client_id:
        redirect_uri = _get_redirect_uri("github")
        providers.append(
            OAuthProviderConfig(
                provider="github",
                client_id=settings.github_client_id,
                authorize_url=_GITHUB_AUTHORIZE_URL,
                scope=_GITHUB_SCOPES,
                redirect_uri=redirect_uri,
            )
        )

    return providers


# ─── Google OAuth ──────────────────────────────────────────────────────────────


@router.post("/google/callback")
@limiter.limit("20/minute")
async def google_callback(
    request: Request,
    body: OAuthCallbackRequest,
    session: DatabaseSession,
) -> Token:
    """Exchange Google authorization code for JWT tokens.

    Args:
        request: FastAPI request (used by rate limiter).
        body: Contains the authorization code.
        session: Database session.

    Returns:
        JWT tokens for the authenticated user.

    """
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured",
        )

    redirect_uri = _get_redirect_uri("google")

    # Exchange authorization code for tokens
    token_data = await _exchange_google_code(body.code, redirect_uri)
    access_token = token_data.get("access_token")
    if not access_token:
        logger.warning("Google OAuth: no access_token in response")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to obtain access token from Google",
        )

    # Fetch user profile
    user_info = await _fetch_google_user(access_token)
    email = user_info.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not retrieve email from Google",
        )

    auth_service = AuthService(session)
    return auth_service.oauth_login_or_register(
        email=email,
        full_name=user_info.get("name"),
        provider="google",
        provider_id=str(user_info.get("id", "")),
    )


async def _exchange_google_code(code: str, redirect_uri: str) -> dict[str, Any]:
    """Exchange Google authorization code for access/id tokens."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    if resp.status_code != 200:
        logger.warning("Google token exchange failed: %s %s", resp.status_code, resp.text)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google token exchange failed",
        )
    return resp.json()  # type: ignore[no-any-return]


async def _fetch_google_user(access_token: str) -> dict[str, Any]:
    """Fetch Google user profile using access token."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        logger.warning("Google userinfo fetch failed: %s", resp.status_code)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to fetch Google user profile",
        )
    return resp.json()  # type: ignore[no-any-return]


# ─── GitHub OAuth ──────────────────────────────────────────────────────────────


@router.post("/github/callback")
@limiter.limit("20/minute")
async def github_callback(
    request: Request,
    body: OAuthCallbackRequest,
    session: DatabaseSession,
) -> Token:
    """Exchange GitHub authorization code for JWT tokens.

    Args:
        request: FastAPI request (used by rate limiter).
        body: Contains the authorization code.
        session: Database session.

    Returns:
        JWT tokens for the authenticated user.

    """
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="GitHub OAuth is not configured",
        )

    redirect_uri = _get_redirect_uri("github")

    # Exchange authorization code for access token
    access_token = await _exchange_github_code(body.code, redirect_uri)

    # Fetch user profile
    user_info = await _fetch_github_user(access_token)
    email = user_info.get("email")

    # GitHub may not include email in profile — fetch from emails API
    if not email:
        email = await _fetch_github_primary_email(access_token)

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


async def _exchange_github_code(code: str, redirect_uri: str) -> str:
    """Exchange GitHub authorization code for access token."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            _GITHUB_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
    if resp.status_code != 200:
        logger.warning("GitHub token exchange failed: %s %s", resp.status_code, resp.text)
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
    return access_token


async def _fetch_github_user(access_token: str) -> dict[str, Any]:
    """Fetch GitHub user profile."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            _GITHUB_USER_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        logger.warning("GitHub user fetch failed: %s", resp.status_code)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to fetch GitHub user profile",
        )
    return resp.json()  # type: ignore[no-any-return]


async def _fetch_github_primary_email(access_token: str) -> str | None:
    """Fetch primary verified email from GitHub emails API."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            _GITHUB_EMAILS_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
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


def build_authorize_url(provider: str, client_id: str, redirect_uri: str, scope: str) -> str:
    """Build the full OAuth authorize URL with query parameters.

    Utility used by tests or server-side redirects if needed.
    """
    if provider == "google":
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": scope,
            "access_type": "offline",
            "prompt": "consent",
        }
        return f"{_GOOGLE_AUTHORIZE_URL}?{urlencode(params)}"
    elif provider == "github":
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scope,
        }
        return f"{_GITHUB_AUTHORIZE_URL}?{urlencode(params)}"
    else:
        msg = f"Unknown provider: {provider}"
        raise ValueError(msg)

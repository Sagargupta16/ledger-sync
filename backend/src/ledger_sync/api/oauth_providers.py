"""Provider configuration and request helpers for the endpoints in ``oauth``.

Public provider URLs and scopes, the enabled-provider list, the restart
redirect builder, the PKCE-client guard, and the profile identity check. The
token-endpoint URLs stay in ``oauth`` beside the callbacks that post to them.
"""

from typing import Any
from urllib.parse import urlsplit

from fastapi import HTTPException, Request, status

from ledger_sync.api.oauth_state import _get_redirect_uri
from ledger_sync.config.settings import settings
from ledger_sync.schemas.auth import OAuthProviderConfig

# ─── Provider Configurations ──────────────────────────────────────────────────

_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
_GOOGLE_SCOPES = "openid email profile"

_GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
_GITHUB_USER_URL = "https://api.github.com/user"
_GITHUB_SCOPES = "read:user user:email"

_GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"

_UPGRADE_MESSAGE = (
    "Sign-in was updated. Refresh this page, then choose Sign in to start a new secure attempt."
)


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


def _frontend_restart_url(provider: str, query: str) -> str:
    """Build the restart redirect only from the configured frontend and a known provider."""
    if provider == "google":
        known_provider = "google"
    elif provider == "github":
        known_provider = "github"
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown provider")
    frontend = urlsplit(settings.frontend_url)
    if frontend.scheme not in {"https", "http"} or not frontend.netloc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sign-in redirect is not configured",
        )
    return f"{_get_redirect_uri(known_provider)}?{query}"


async def _require_pkce_client(request: Request) -> None:
    """Give old callbacks actionable recovery before required-field validation."""
    try:
        body = await request.json()
    except ValueError:
        # Leave malformed or absent JSON to FastAPI's request validation.
        return
    if isinstance(body, dict) and body.get("code_verifier") is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_UPGRADE_MESSAGE)


# ─── Shared helpers ───────────────────────────────────────────────────────────


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

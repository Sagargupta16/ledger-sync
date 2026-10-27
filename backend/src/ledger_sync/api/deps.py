"""API dependencies for dependency injection.

This module contains shared dependencies used across API endpoints.
Centralizing dependencies here prevents circular imports and improves testability.
"""

from collections.abc import Callable
from dataclasses import dataclass
from functools import cache
from typing import Annotated
from urllib.parse import urlparse

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.config.settings import settings
from ledger_sync.core.auth.tokens import verify_token
from ledger_sync.db._models.upload_tokens import TOKEN_SCOPES
from ledger_sync.db.models import User
from ledger_sync.db.session import SessionLocal, get_session
from ledger_sync.services.upload_tokens import PLAINTEXT_PREFIX, authenticate_upload_token

# Security scheme
security = HTTPBearer()


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    """Get the current authenticated user from JWT token.

    Args:
        credentials: HTTP Bearer token
        session: Database session

    Returns:
        Current user object

    Raises:
        HTTPException: If token is invalid or user not found

    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials

    # First-pass decode to get user_id so we can look up the current token_version.
    token_data = verify_token(token, token_type="access")
    if token_data is None or token_data.user_id is None:
        raise credentials_exception

    user = session.execute(select(User).where(User.id == token_data.user_id)).scalar_one_or_none()

    if user is None:
        raise credentials_exception

    # Second-pass verification: reject tokens whose baked-in tv doesn't match the
    # user's current token_version (bumped on logout / reset / delete).
    if verify_token(token, token_type="access", expected_tv=user.token_version) is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    return user


@dataclass(frozen=True, slots=True)
class ProviderIdentity:
    """Authenticated identity for routes that only call an external provider."""

    id: int


def get_provider_identity(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> ProviderIdentity:
    """Finish authentication and release its connection before the provider call.

    Keep this separate from get_current_user: ledger routes still share their
    request session and ORM user. No ORM object escapes this short-lived scope.
    """
    with SessionLocal() as session:
        user = get_current_user(credentials, session)
        return ProviderIdentity(id=user.id)


@dataclass(frozen=True, slots=True)
class UploadPrincipal:
    """Who is uploading a backup: a signed-in user, or an upload token acting for one."""

    user_id: int
    token_id: int | None = None


def get_upload_principal(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    session: Annotated[Session, Depends(get_session)],
) -> UploadPrincipal:
    """Accept an access token, or an upload token on the backup upload route only."""
    token = credentials.credentials
    if not token.startswith(PLAINTEXT_PREFIX):
        return UploadPrincipal(user_id=get_current_user(credentials, session).id)
    authenticated = authenticate_upload_token(session, token)
    if authenticated is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This upload token is invalid, expired or revoked. Create one in Settings.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    record, _ = authenticated
    principal = UploadPrincipal(user_id=record.user_id, token_id=record.id)
    # Record the use and end the authentication transaction before the upload.
    session.commit()
    return principal


@cache
def require_token_scope(scope: str) -> Callable[..., User]:
    """A dependency that accepts only an ``lsu_`` token holding *scope*.

    It returns the token's active user, recording the use and committing so the
    route starts a fresh transaction. Anything else (no token, an access token,
    or a revoked, expired or other-scope token) is a 401. Cached per scope, so
    ``Depends(require_token_scope(s))`` is one callable that tests can override.
    """
    if scope not in TOKEN_SCOPES:
        raise ValueError(f"Unknown token scope: {scope}")

    def authenticate_scoped_token(
        credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
        session: Annotated[Session, Depends(get_session)],
    ) -> User:
        authenticated = authenticate_upload_token(session, credentials.credentials, scope)
        if authenticated is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=(
                    f"This token is invalid, expired, revoked or not a {scope} token. "
                    "Create one in Settings."
                ),
                headers={"WWW-Authenticate": "Bearer"},
            )
        _, user = authenticated
        _commit_keeping_loaded(session)
        return user

    return authenticate_scoped_token


def _commit_keeping_loaded(session: Session) -> None:
    """End the authentication transaction without expiring what it loaded.

    It commits even when the last use did not change, so the MCP read-only guard
    has nothing to roll back, and the user stays loaded (no SELECT per ``user.id``).
    """
    expire_on_commit = session.expire_on_commit
    session.expire_on_commit = False
    try:
        session.commit()
    finally:
        session.expire_on_commit = expire_on_commit


def cors_allowed_origins() -> list[str]:
    """The configured CORS origins plus the frontend's; also the MCP Origin allowlist."""
    origins = list(settings.cors_origins)
    if settings.frontend_url:
        parsed = urlparse(settings.frontend_url)
        frontend_origin = f"{parsed.scheme}://{parsed.netloc}"
        if frontend_origin not in origins:
            origins.append(frontend_origin)
    return origins


def get_http_client(request: Request) -> httpx.AsyncClient:
    """Get the shared httpx client from app state (created in lifespan)."""
    client: httpx.AsyncClient = request.app.state.http_client
    return client


# Type aliases for dependency injection
CurrentUser = Annotated[User, Depends(get_current_user)]
ProviderUser = Annotated[ProviderIdentity, Depends(get_provider_identity)]
UploadUser = Annotated[UploadPrincipal, Depends(get_upload_principal)]
DatabaseSession = Annotated[Session, Depends(get_session)]
HttpClient = Annotated[httpx.AsyncClient, Depends(get_http_client)]

"""Authentication API endpoints.

OAuth-only authentication. Token refresh, logout, profile management,
and account delete/reset. Login is handled by the OAuth router.

Rate-limited refresh to prevent abuse (CWE-307).
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.config.settings import settings
from ledger_sync.core.auth.token_blacklist import token_blacklist
from ledger_sync.schemas.auth import (
    MessageResponse,
    RefreshTokenRequest,
    Token,
    UserResponse,
    UserUpdate,
)
from ledger_sync.services.auth_service import AuthService

router = APIRouter(prefix="/api/auth", tags=["authentication"])

# Rate limiter — keyed by client IP address
limiter = Limiter(key_func=get_remote_address)


# =============================================================================
# Dependency: Auth Service
# =============================================================================


def get_auth_service(
    session: DatabaseSession,
) -> AuthService:
    """Get auth service instance with database session."""
    return AuthService(session)


# Type alias for dependency injection
AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


# =============================================================================
# API Endpoints
# =============================================================================


@router.post("/refresh")
@limiter.limit("20/minute")
def refresh_token(
    request: Request,
    token_request: RefreshTokenRequest,
    auth_service: AuthServiceDep,
) -> Token:
    """Refresh access token using refresh token."""
    return auth_service.refresh_tokens(token_request.refresh_token)


@router.get("/me")
def get_me(current_user: CurrentUser, auth_service: AuthServiceDep) -> UserResponse:
    """Get current user profile."""
    return auth_service.get_user_response(current_user)


@router.post("/logout")
def logout(request: Request, current_user: CurrentUser) -> MessageResponse:
    """Logout current user and invalidate current access token.

    Blacklists the current access token so it cannot be reused.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        access_token = auth_header[7:]
        # Blacklist for remaining access token lifetime (30 min max)
        token_blacklist.add(access_token, settings.jwt_access_token_expire_minutes * 60)
    return MessageResponse(message="Successfully logged out")


@router.put("/me")
def update_profile(
    current_user: CurrentUser,
    auth_service: AuthServiceDep,
    updates: UserUpdate,
) -> UserResponse:
    """Update current user profile."""
    updated_user = auth_service.update_profile(current_user, updates.full_name)
    return auth_service.get_user_response(updated_user)


@router.delete("/account")
def delete_account(
    current_user: CurrentUser,
    auth_service: AuthServiceDep,
) -> MessageResponse:
    """Permanently delete the current user's account and all data.

    WARNING: This action is irreversible!
    Requires active authentication (JWT token).
    """
    auth_service.delete_account(current_user)
    return MessageResponse(message="Account and all data permanently deleted")


@router.post("/account/reset")
def reset_account(
    current_user: CurrentUser,
    auth_service: AuthServiceDep,
    mode: Literal["full", "transactions"] = Query("full"),
) -> MessageResponse:
    """Reset account data, keeping OAuth login.

    Requires active authentication (JWT token).

    - **full** (default): Removes all data and recreates default preferences.
    - **transactions**: Removes only transactions, import logs, and analytics.
      Preserves preferences, budgets, goals, and account classifications.
    """
    auth_service.reset_account(current_user, transactions_only=(mode == "transactions"))
    if mode == "transactions":
        return MessageResponse(message="Transactions and analytics cleared. Preferences preserved.")
    return MessageResponse(message="Account reset to fresh state. All data cleared.")

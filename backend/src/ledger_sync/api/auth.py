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
def logout(current_user: CurrentUser) -> MessageResponse:
    """Logout current user.

    The frontend clears its stored tokens; we don't maintain a server-side
    revocation list. The access token remains technically valid until its
    natural expiry (30 min by default). The refresh token is single-use
    in the sense that the frontend discards it on logout, but if it were
    captured beforehand it would still work until expiry.

    Use account/reset or account delete to invalidate sessions in a way
    that actually clears server-side state.
    """
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
    mode: Annotated[Literal["full", "transactions"], Query()] = "full",
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

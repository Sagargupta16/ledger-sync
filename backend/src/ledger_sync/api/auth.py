"""Authentication API endpoints.

This module handles user authentication including registration, login,
token refresh, and profile management.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser
from ledger_sync.db.session import get_session
from ledger_sync.schemas.auth import (
    MessageResponse,
    RefreshTokenRequest,
    Token,
    UserLogin,
    UserRegister,
    UserResponse,
    UserUpdate,
)
from ledger_sync.services.auth_service import AuthService

router = APIRouter(prefix="/api/auth", tags=["authentication"])


# =============================================================================
# Dependency: Auth Service
# =============================================================================


def get_auth_service(
    session: Annotated[Session, Depends(get_session)],
) -> AuthService:
    """Get auth service instance with database session.

    Args:
        session: Database session

    Returns:
        AuthService instance

    """
    return AuthService(session)


# Type alias for dependency injection
AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


# =============================================================================
# API Endpoints
# =============================================================================


@router.post("/register", response_model=Token, status_code=201)
def register(user_data: UserRegister, auth_service: AuthServiceDep) -> Token:
    """Register a new user.

    Args:
        user_data: User registration data
        auth_service: Authentication service

    Returns:
        JWT tokens for the new user

    Raises:
        HTTPException: If email already exists or password too short

    """
    return auth_service.register(user_data)


@router.post("/login", response_model=Token)
def login(credentials: UserLogin, auth_service: AuthServiceDep) -> Token:
    """Login with email and password.

    Args:
        credentials: Login credentials
        auth_service: Authentication service

    Returns:
        JWT tokens

    Raises:
        HTTPException: If credentials are invalid

    """
    return auth_service.login(credentials)


@router.post("/refresh", response_model=Token)
def refresh_token(request: RefreshTokenRequest, auth_service: AuthServiceDep) -> Token:
    """Refresh access token using refresh token.

    Args:
        request: Refresh token request
        auth_service: Authentication service

    Returns:
        New JWT tokens

    Raises:
        HTTPException: If refresh token is invalid

    """
    return auth_service.refresh_tokens(request.refresh_token)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: CurrentUser, auth_service: AuthServiceDep) -> UserResponse:
    """Get current user profile.

    Args:
        current_user: Current authenticated user
        auth_service: Authentication service

    Returns:
        User profile data

    """
    return auth_service.get_user_response(current_user)


@router.post("/logout", response_model=MessageResponse)
def logout(current_user: CurrentUser) -> MessageResponse:
    """Logout current user.

    Note: JWT tokens are stateless, so this endpoint just returns success.
    The client should delete the tokens from storage.

    Args:
        current_user: Current authenticated user

    Returns:
        Success message

    """
    return MessageResponse(message="Successfully logged out")


@router.put("/me", response_model=UserResponse)
def update_profile(
    current_user: CurrentUser,
    auth_service: AuthServiceDep,
    updates: UserUpdate,
) -> UserResponse:
    """Update current user profile.

    Args:
        current_user: Current authenticated user
        auth_service: Authentication service
        updates: Profile update data

    Returns:
        Updated user profile

    """
    updated_user = auth_service.update_profile(current_user, updates.full_name)
    return auth_service.get_user_response(updated_user)


@router.delete("/account", response_model=MessageResponse)
def delete_account(
    current_user: CurrentUser,
    auth_service: AuthServiceDep,
) -> MessageResponse:
    """Permanently delete the current user's account and all data.

    WARNING: This action is irreversible!
    Deletes: all transactions, import history, preferences, and the account itself.

    Args:
        current_user: Current authenticated user
        auth_service: Authentication service

    Returns:
        Confirmation message

    """
    auth_service.delete_account(current_user)
    return MessageResponse(message="Account and all data permanently deleted")


@router.post("/account/reset", response_model=MessageResponse)
def reset_account(
    current_user: CurrentUser,
    auth_service: AuthServiceDep,
) -> MessageResponse:
    """Reset account to fresh state, keeping login credentials.

    This removes all data but preserves your account:
    - Deletes all transactions
    - Deletes import history
    - Resets preferences to defaults

    Args:
        current_user: Current authenticated user
        auth_service: Authentication service

    Returns:
        Confirmation message

    """
    auth_service.reset_account(current_user)
    return MessageResponse(message="Account reset to fresh state. All data cleared.")

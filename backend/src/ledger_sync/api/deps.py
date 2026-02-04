"""API dependencies for dependency injection.

This module contains shared dependencies used across API endpoints.
Centralizing dependencies here prevents circular imports and improves testability.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core.auth.tokens import verify_token
from ledger_sync.db.models import User
from ledger_sync.db.session import get_session

# Security scheme
security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)


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

    token_data = verify_token(credentials.credentials, token_type="access")
    if token_data is None or token_data.user_id is None:
        raise credentials_exception

    user = session.execute(select(User).where(User.id == token_data.user_id)).scalar_one_or_none()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    return user


def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(optional_security)],
    session: Annotated[Session, Depends(get_session)],
) -> User | None:
    """Get the current user if authenticated, otherwise return None.

    Useful for endpoints that work differently for authenticated/unauthenticated users.

    Args:
        credentials: Optional HTTP Bearer token
        session: Database session

    Returns:
        User object if authenticated, None otherwise

    """
    if credentials is None:
        return None

    token_data = verify_token(credentials.credentials, token_type="access")
    if token_data is None or token_data.user_id is None:
        return None

    user = session.execute(select(User).where(User.id == token_data.user_id)).scalar_one_or_none()

    if user is None or not user.is_active:
        return None

    return user


# Type aliases for dependency injection
CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
DatabaseSession = Annotated[Session, Depends(get_session)]

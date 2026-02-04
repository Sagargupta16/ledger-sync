"""JWT token utilities.

Provides functions for creating, decoding, and verifying JWT tokens.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt

from ledger_sync.config.settings import settings
from ledger_sync.schemas.auth import Token, TokenData, TokenPayload


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token.

    Args:
        data: Data to encode in the token (should include 'sub' and 'email')
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT access token string

    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_access_token_expire_minutes)

    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a JWT refresh token.

    Args:
        data: Data to encode in the token (should include 'sub' and 'email')
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT refresh token string

    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(days=settings.jwt_refresh_token_expire_days)

    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_tokens(user_id: int, email: str) -> Token:
    """Create both access and refresh tokens for a user.

    Args:
        user_id: User's database ID
        email: User's email address

    Returns:
        Token object containing access_token, refresh_token, and token_type

    """
    token_data = {"sub": str(user_id), "email": email}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    return Token(access_token=access_token, refresh_token=refresh_token)


def decode_token(token: str) -> TokenPayload | None:
    """Decode and validate a JWT token.

    Args:
        token: JWT token string to decode

    Returns:
        TokenPayload if valid, None if invalid or expired

    """
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        return TokenPayload(
            sub=payload.get("sub"),
            email=payload.get("email"),
            exp=datetime.fromtimestamp(payload.get("exp"), tz=UTC),
            type=payload.get("type", "access"),
        )
    except JWTError:
        return None


def verify_token(token: str, token_type: str = "access") -> TokenData | None:
    """Verify a JWT token and extract user data.

    Args:
        token: JWT token string to verify
        token_type: Expected token type ("access" or "refresh")

    Returns:
        TokenData with user_id and email if valid, None otherwise

    """
    payload = decode_token(token)
    if payload is None:
        return None

    # Verify token type matches expected
    if payload.type != token_type:
        return None

    # Verify token hasn't expired
    if payload.exp < datetime.now(UTC):
        return None

    return TokenData(user_id=int(payload.sub), email=payload.email)

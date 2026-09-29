"""JWT token utilities.

Provides functions for creating, decoding, and verifying JWT tokens.
Uses PyJWT (actively maintained, no vulnerable ecdsa dependency).

## Session revocation via token_version

Every token embeds a ``tv`` (token_version) claim mirroring
``User.token_version``. Bumping the DB column on logout / account reset /
delete invalidates all outstanding tokens for that user in one write --
no per-token blocklist required.

During the rollout window, tokens issued by the pre-2026-07 code path
have no ``tv`` claim. ``verify_token`` treats missing ``tv`` as 0 unless
``settings.jwt_strict_tv`` is true. Flip that flag on day 8 (refresh TTL
= 7 days + 1 buffer) to hard-cutoff legacy tokens.

## Refresh rotation

Refresh tokens issued by ``AuthService`` carry a ``jti`` naming a one-use
issuance record; see ``AuthService.refresh_tokens`` for the rotation rules.

## Purpose keys

JWTs stay signed with the raw ``jwt_secret_key`` (changing that would end
every session). Other HMACs use ``purpose_key`` so a value signed for one
purpose can never verify as another.
"""

from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

import jwt
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from ledger_sync.config.settings import settings
from ledger_sync.schemas.auth import Token, TokenData, TokenPayload


@lru_cache(maxsize=16)
def _derive_purpose_key(secret: str, info: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=info).derive(secret.encode())


def purpose_key(info: bytes) -> bytes:
    """HKDF-SHA256 subkey of the JWT secret for one named HMAC purpose."""
    return _derive_purpose_key(settings.jwt_secret_key, info)


def legacy_signing_key() -> bytes:
    """Raw JWT secret, still accepted when verifying values signed before subkeys."""
    return settings.jwt_secret_key.encode()


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_access_token_expire_minutes)

    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a JWT refresh token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(days=settings.jwt_refresh_token_expire_days)

    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_tokens(
    user_id: int, email: str, token_version: int = 0, refresh_jti: str | None = None
) -> Token:
    """Create both access and refresh tokens for a user.

    Args:
        user_id: User's database ID.
        email: User's email address.
        token_version: Current ``User.token_version`` value, baked into ``tv``
            claim so a subsequent bump invalidates this token pair.
        refresh_jti: One-use issuance identifier embedded in the refresh token.

    Returns:
        Token object containing access_token, refresh_token, and token_type.
    """
    token_data: dict[str, Any] = {"sub": str(user_id), "email": email, "tv": token_version}
    access_token = create_access_token(token_data)
    refresh_data = token_data if refresh_jti is None else {**token_data, "jti": refresh_jti}
    refresh_token = create_refresh_token(refresh_data)
    return Token(access_token=access_token, refresh_token=refresh_token)


def decode_token(token: str) -> TokenPayload | None:
    """Decode and validate a JWT token."""
    try:
        payload: dict[str, Any] = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        return TokenPayload(
            sub=payload.get("sub", ""),
            email=payload.get("email", ""),
            exp=datetime.fromtimestamp(payload.get("exp", 0), tz=UTC),
            type=payload.get("type", "access"),
            tv=payload.get("tv"),  # None on legacy pre-tv tokens; enforced below
            jti=payload.get("jti"),
        )
    except (jwt.PyJWTError, ValueError):
        return None


def verify_token(
    token: str,
    token_type: str = "access",
    expected_tv: int | None = None,
) -> TokenData | None:
    """Verify a JWT token and extract user data.

    Args:
        token: JWT token string to verify.
        token_type: Expected token type ("access" or "refresh").
        expected_tv: Current ``User.token_version`` for the token's subject.
            When provided, the token's ``tv`` claim must match. Pre-migration
            tokens with no ``tv`` claim are accepted as ``tv=0`` unless
            ``settings.jwt_strict_tv`` is true.

    Returns:
        TokenData with user_id and email if valid, None otherwise.
    """
    payload = decode_token(token)
    if payload is None:
        return None

    if payload.type != token_type:
        return None

    if payload.exp < datetime.now(UTC):
        return None

    if expected_tv is not None:
        token_tv = payload.tv
        if token_tv is None:
            # Legacy token from before token_version rolled out.
            if settings.jwt_strict_tv:
                return None
            token_tv = 0
        if token_tv != expected_tv:
            return None

    try:
        user_id = int(payload.sub)
    except (TypeError, ValueError):
        return None

    return TokenData(user_id=user_id, email=payload.email, tv=payload.tv, jti=payload.jti)

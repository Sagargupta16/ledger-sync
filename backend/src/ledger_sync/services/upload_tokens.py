"""Create, list, revoke and authenticate upload-only tokens.

A token is ``lsu_`` plus 32 random bytes (URL-safe base64). Only its SHA-256 is
stored, compared through the unique index, and the plaintext leaves the server
once, in the create response. Tokens expire after a year and can be revoked
at any time; a revoked or expired token authenticates nothing.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from ledger_sync.db._models.upload_tokens import UPLOAD_SCOPE, UploadToken
from ledger_sync.db.models import User

PLAINTEXT_PREFIX = "lsu_"
TOKEN_LIFETIME = timedelta(days=365)
MAX_ACTIVE_TOKENS = 5
# Characters of the plaintext kept for display, prefix included.
_DISPLAY_PREFIX = 12


class TooManyTokensError(ValueError):
    """The user already holds the maximum number of active tokens."""


def _now() -> datetime:
    """Naive UTC, like the other audit timestamps."""
    return datetime.now(UTC).replace(tzinfo=None)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _active(user_id: int, now: datetime) -> tuple[ColumnElement[bool], ...]:
    return (
        UploadToken.user_id == user_id,
        UploadToken.revoked_at.is_(None),
        UploadToken.expires_at > now,
    )


def list_upload_tokens(db: Session, user_id: int) -> list[UploadToken]:
    stmt = select(UploadToken).where(*_active(user_id, _now())).order_by(UploadToken.created_at)
    return list(db.scalars(stmt))


def create_upload_token(db: Session, user_id: int, name: str) -> tuple[UploadToken, str]:
    """Store a new token's hash and return the record with the one-time plaintext."""
    now = _now()
    active = db.scalar(select(func.count()).select_from(UploadToken).where(*_active(user_id, now)))
    if (active or 0) >= MAX_ACTIVE_TOKENS:
        raise TooManyTokensError(
            f"You already have {MAX_ACTIVE_TOKENS} active upload tokens. Revoke one first."
        )
    plaintext = PLAINTEXT_PREFIX + secrets.token_urlsafe(32)
    record = UploadToken(
        user_id=user_id,
        name=name.strip(),
        token_prefix=plaintext[:_DISPLAY_PREFIX],
        token_hash=hash_token(plaintext),
        scope=UPLOAD_SCOPE,
        created_at=now,
        expires_at=now + TOKEN_LIFETIME,
    )
    db.add(record)
    db.flush()
    return record, plaintext


def revoke_upload_token(db: Session, user_id: int, token_id: int) -> bool:
    """Revoke one of the user's active tokens; False when there is no such token."""
    record = db.scalar(
        select(UploadToken).where(UploadToken.id == token_id, *_active(user_id, _now()))
    )
    if record is None:
        return False
    record.revoked_at = _now()
    return True


def authenticate_upload_token(db: Session, token: str) -> UploadToken | None:
    """The active token record for an active user, with its last use recorded."""
    if not token.startswith(PLAINTEXT_PREFIX):
        return None
    now = _now()
    record = db.scalar(
        select(UploadToken).where(
            UploadToken.token_hash == hash_token(token),
            UploadToken.revoked_at.is_(None),
            UploadToken.expires_at > now,
            UploadToken.scope == UPLOAD_SCOPE,
        )
    )
    if record is None:
        return None
    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        return None
    record.last_used_at = now
    return record

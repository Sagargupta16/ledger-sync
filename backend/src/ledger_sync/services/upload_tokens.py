"""Create, list, revoke and authenticate single-scope automation tokens.

A token is ``lsu_`` plus 32 random bytes (URL-safe base64). Only its SHA-256 is
stored, compared through the unique index, and the plaintext leaves the server
once, in the create response. Each token carries one scope and authenticates
only for that scope. Tokens expire after a year and can be revoked at any
time; a revoked or expired token authenticates nothing.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from ledger_sync.db._models.upload_tokens import (
    ALERTS_INGEST_SCOPE,
    LEDGER_READ_SCOPE,
    TOKEN_SCOPES,
    UPLOAD_SCOPE,
    UploadToken,
)
from ledger_sync.db.models import User

PLAINTEXT_PREFIX = "lsu_"
TOKEN_LIFETIME = timedelta(days=365)
# Per scope, so upload Shortcuts never crowd out an MCP client.
MAX_ACTIVE_TOKENS = 5
# Characters of the plaintext kept for display, prefix included.
_DISPLAY_PREFIX = 12
# Settings shows the last use to the minute, so a burst of MCP calls writes it once.
_LAST_USED_STEP = timedelta(minutes=1)
_SCOPE_NOUNS = {
    UPLOAD_SCOPE: "upload",
    LEDGER_READ_SCOPE: "MCP read",
    ALERTS_INGEST_SCOPE: "alert inbox",
}


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


def create_upload_token(
    db: Session, user_id: int, name: str, scope: str = UPLOAD_SCOPE
) -> tuple[UploadToken, str]:
    """Store a new token's hash and return the record with the one-time plaintext."""
    if scope not in TOKEN_SCOPES:
        raise ValueError(f"Unknown token scope: {scope}")
    now = _now()
    active = db.scalar(
        select(func.count())
        .select_from(UploadToken)
        .where(*_active(user_id, now), UploadToken.scope == scope)
    )
    if (active or 0) >= MAX_ACTIVE_TOKENS:
        raise TooManyTokensError(
            f"You already have {MAX_ACTIVE_TOKENS} active {_SCOPE_NOUNS.get(scope, scope)} tokens. "
            "Revoke one first."
        )
    plaintext = PLAINTEXT_PREFIX + secrets.token_urlsafe(32)
    record = UploadToken(
        user_id=user_id,
        name=name.strip(),
        token_prefix=plaintext[:_DISPLAY_PREFIX],
        token_hash=hash_token(plaintext),
        scope=scope,
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


def authenticate_upload_token(
    db: Session, token: str, scope: str = UPLOAD_SCOPE
) -> tuple[UploadToken, User] | None:
    """The active *scope* token and its active user, loaded in one query.

    The token's last use is set when it is unset or a minute old, so the caller
    has a write to commit at most once a minute per token.
    """
    if not token.startswith(PLAINTEXT_PREFIX):
        return None
    now = _now()
    found = (
        db.execute(
            select(UploadToken, User)
            .join(User, User.id == UploadToken.user_id)
            .where(
                UploadToken.token_hash == hash_token(token),
                UploadToken.revoked_at.is_(None),
                UploadToken.expires_at > now,
                UploadToken.scope == scope,
                User.is_active.is_(True),
            )
        )
        .tuples()
        .one_or_none()
    )
    if found is None:
        return None
    record, _ = found
    if record.last_used_at is None or now - record.last_used_at >= _LAST_USED_STEP:
        record.last_used_at = now
    return found

"""Refresh-token rotation for ``AuthService``.

Issues one-use refresh tokens backed by ``audit_logs`` issuance records and
consumes them atomically, tolerating concurrent refreshes and revoking every
session on replay. See ``AuthService.refresh_tokens`` for the contract.
"""

import hashlib
import logging
import secrets
import time
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from ledger_sync.config.settings import settings
from ledger_sync.core.auth import create_tokens
from ledger_sync.db.models import AuditLog, User
from ledger_sync.schemas.auth import Token

logger = logging.getLogger("ledger_sync.auth")

# Refresh rotation state lives in audit_logs, like OAuth attempts, so it needs
# no dedicated table and is consumed atomically across serverless instances.
_REFRESH_OPERATION = "refresh_token"
_REFRESH_ENTITY = "refresh_jti"
_LEGACY_REFRESH_ENTITY = "refresh_legacy"
# Covers tabs refreshing the same stored token at once, and a retried request.
_REFRESH_REUSE_GRACE_SECONDS = 60


def _naive_utc(epoch_seconds: int) -> datetime:
    """audit_logs.created_at is a naive UTC column."""
    return datetime.fromtimestamp(epoch_seconds, UTC).replace(tzinfo=None)


def _consumed_at(value: str | None) -> int:
    """Read a stored consumption time; unreadable values count as long ago."""
    try:
        return int(value or 0)
    except ValueError:
        return 0


def _invalid_refresh_token() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )


class RefreshRotationMixin:
    """Mixin: one-use refresh issuance and consumption over ``audit_logs``."""

    session: Session

    def _issue_tokens(self, user: User) -> Token:
        """Commit a one-use refresh issuance record and sign a pair naming it."""
        now = int(time.time())
        cutoff = now - (settings.jwt_refresh_token_expire_days + 1) * 86400
        # Records outlive their tokens by a day, then go; bounded per user.
        self.session.execute(
            delete(AuditLog).where(
                AuditLog.user_id == user.id,
                AuditLog.operation == _REFRESH_OPERATION,
                AuditLog.created_at <= _naive_utc(cutoff),
            )
        )
        nonce = secrets.token_urlsafe(24)
        record = AuditLog(
            user_id=user.id,
            operation=_REFRESH_OPERATION,
            entity_type=_REFRESH_ENTITY,
            entity_id=nonce,
            action="issued",
            created_at=_naive_utc(now),
        )
        self.session.add(record)
        self.session.flush()
        tokens = create_tokens(
            user.id, user.email, user.token_version, refresh_jti=f"{record.id}.{nonce}"
        )
        self.session.commit()
        return tokens

    def _consume_refresh_token(self, user: User, refresh_token: str, jti: str | None) -> None:
        """Mark a refresh token used, tolerating concurrent use and revoking replay."""
        now = int(time.time())
        if jti is None:
            consumed_at = self._consume_legacy_refresh_token(user.id, refresh_token, now)
        else:
            consumed_at = self._consume_issued_refresh_token(user.id, jti, now)
        if consumed_at is None or now - consumed_at <= _REFRESH_REUSE_GRACE_SECONDS:
            return

        self.session.execute(
            update(User).where(User.id == user.id).values(token_version=User.token_version + 1)
        )
        self.session.commit()
        logger.warning("Refresh token replayed; revoked sessions for user_id=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This session was used elsewhere and has been signed out. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    def _consume_issued_refresh_token(self, user_id: int, jti: str, now: int) -> int | None:
        """Atomically consume an issuance record; return an earlier consumption time."""
        record_id, _, nonce = jti.partition(".")
        if not (record_id.isascii() and record_id.isdigit() and nonce):
            raise _invalid_refresh_token()
        matches_record = (
            AuditLog.id == int(record_id),
            AuditLog.user_id == user_id,
            AuditLog.operation == _REFRESH_OPERATION,
            AuditLog.entity_type == _REFRESH_ENTITY,
            AuditLog.entity_id == nonce,
        )
        consumed_id = self.session.execute(
            update(AuditLog)
            .where(*matches_record, AuditLog.action == "issued")
            .values(action="consumed", new_value=str(now))
            .returning(AuditLog.id)
        ).scalar_one_or_none()
        if consumed_id is not None:
            return None

        earlier = self.session.execute(
            select(AuditLog.new_value).where(*matches_record, AuditLog.action == "consumed")
        ).scalar_one_or_none()
        if earlier is None:
            raise _invalid_refresh_token()
        return _consumed_at(earlier)

    def _consume_legacy_refresh_token(
        self, user_id: int, refresh_token: str, now: int
    ) -> int | None:
        """Record a pre-rotation token's first use by digest; return an earlier use."""
        digest = hashlib.sha256(refresh_token.encode()).hexdigest()
        # Serialize one user's legacy refreshes (row lock on PostgreSQL).
        self.session.execute(select(User.id).where(User.id == user_id).with_for_update())
        earlier = (
            self.session.execute(
                select(AuditLog.new_value).where(
                    AuditLog.user_id == user_id,
                    AuditLog.operation == _REFRESH_OPERATION,
                    AuditLog.entity_type == _LEGACY_REFRESH_ENTITY,
                    AuditLog.entity_id == digest,
                )
            )
            .scalars()
            .first()
        )
        if earlier is not None:
            return _consumed_at(earlier)
        self.session.add(
            AuditLog(
                user_id=user_id,
                operation=_REFRESH_OPERATION,
                entity_type=_LEGACY_REFRESH_ENTITY,
                entity_id=digest,
                action="consumed",
                new_value=str(now),
                created_at=_naive_utc(now),
            )
        )
        return None

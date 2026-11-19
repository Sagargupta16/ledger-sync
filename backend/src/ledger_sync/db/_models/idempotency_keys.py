"""Idempotency keys for the two ledger upload routes.

A client that may retry an upload (a timeout, a dropped connection) sends an
``Idempotency-Key`` header. One row per user, route and key records how far
that upload got, so a retry returns the saved result instead of importing
twice. Rows are a 24-hour replay cache, never a record the user owns: the
reaper, a ledger reset and an account delete all remove them, and the routes
work as before when the table is absent. services/idempotency.py owns every
state change.
"""

from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base


class IdempotencyState(StrEnum):
    """How far one keyed upload got; see docs/STATE_MACHINES.md."""

    STARTED = "started"
    LEDGER_SAVED = "ledger_saved"
    COMPLETED = "completed"


def _now() -> datetime:
    """Naive UTC, like the other audit timestamps."""
    return datetime.now(UTC).replace(tzinfo=None)


class IdempotencyKey(Base):
    """One claimed key: the request it belongs to and, once saved, its 200 body."""

    __tablename__ = "idempotency_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    # "upload" or "money_manager": the same key on two routes is two uploads.
    route: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    # SHA-256 hex of the route, its options and the body; a different upload is refused.
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False)
    # The response model as JSON; null while started.
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # When the running request claimed the key, and the fence its writes match on.
    locked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_now, onupdate=_now
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "route", "idempotency_key", name="uq_idempotency_keys_user_route_key"
        ),
        Index("ix_idempotency_keys_user_created", "user_id", "created_at"),
        CheckConstraint(
            "state IN ('started', 'ledger_saved', 'completed')", name="ck_idempotency_keys_state"
        ),
    )

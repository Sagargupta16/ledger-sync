"""Long-lived, upload-only credentials for automations such as an iOS Shortcut.

Shortcuts cannot run the OAuth sign-in, so a user creates one of these in
Settings and pastes it into the automation. Only its SHA-256 is stored; the
plaintext is returned once, at creation. A token can only upload a Money
Manager backup: it never reads ledger data or reaches any other endpoint.
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base

UPLOAD_SCOPE = "mmbak:upload"


class UploadToken(Base):
    """One revocable upload credential, identified by its hash."""

    __tablename__ = "upload_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # The first characters of the plaintext, shown so a user can tell tokens apart.
    token_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    scope: Mapped[str] = mapped_column(String(32), nullable=False, default=UPLOAD_SCOPE)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_upload_tokens_token_hash"),
        Index("ix_upload_tokens_user_id", "user_id"),
    )

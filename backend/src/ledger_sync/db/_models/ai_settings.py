"""User-owned AI configuration, separate from analytics preferences."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base

if TYPE_CHECKING:
    from ledger_sync.db._models.user import User


class UserAISettings(Base):
    """Provider configuration and encrypted credentials for one user."""

    __tablename__ = "user_ai_settings"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), primary_key=True, autoincrement=False
    )
    ai_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default="app_bedrock", server_default="app_bedrock"
    )
    ai_provider: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    ai_model: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)
    ai_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    # NULL means unlimited; zero blocks calls. App message caps remain server settings.
    ai_daily_token_limit: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    ai_monthly_token_limit: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)

    # Historical preferences may have unknown dates; only new rows receive defaults.
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=lambda: datetime.now(UTC), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        server_default=func.now(),
    )

    user: Mapped[User] = relationship("User")

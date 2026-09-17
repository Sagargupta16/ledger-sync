"""One durable analytics generation and bounded dirty-day set per user."""

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, Text, true
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base


class AnalyticsState(Base):
    """Invalidation and publication metadata, committed with the data it describes."""

    __tablename__ = "analytics_state"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), primary_key=True
    )
    ledger_version: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    preferences_version: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    algorithm_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    published_ledger_version: Mapped[int] = mapped_column(
        BigInteger, default=-1, server_default="-1"
    )
    published_preferences_version: Mapped[int] = mapped_column(
        BigInteger, default=-1, server_default="-1"
    )
    published_algorithm_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    full_rebuild_required: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true()
    )
    dirty_dates: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

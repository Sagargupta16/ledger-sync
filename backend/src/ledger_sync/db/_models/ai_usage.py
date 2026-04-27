"""AIUsageLog model -- one row per LLM round-trip.

Recorded for transparency, cost awareness, and per-user daily/monthly limits.
For OpenAI and Anthropic the frontend reports usage after each response
(browser-direct calls never touch our backend otherwise). For Bedrock the
backend records server-side after converse().
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base

if TYPE_CHECKING:
    from ledger_sync.db._models.user import User


class AIUsageLog(Base):
    """Single LLM call cost + token record."""

    __tablename__ = "ai_usage_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # When the call completed (server clock; self-reported calls use this too)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )

    # Provider + model so per-provider dashboards stay sensible when a user
    # switches providers mid-month.
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)

    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # One user "message" can trigger multiple backend rounds when tools are
    # called -- we record each one separately but tag them with the round.
    tool_rounds: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Pre-computed USD cost so reports don't need to re-query pricing tables.
    # Fine to be approximate (providers publish rates by the month).
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    user: Mapped[User] = relationship("User", back_populates="ai_usage_logs")

    # Primary aggregation path: "this user's usage in the last N days". The
    # (user_id, timestamp) composite lets us answer it with an index scan.
    __table_args__ = (Index("ix_ai_usage_user_timestamp", "user_id", "timestamp"),)

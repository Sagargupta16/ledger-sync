"""Saved views a user pinned to the Dashboard as watch tiles.

One row per (user, view). ``position`` orders the tiles and is deliberately not
unique, so a reorder can rewrite every row in one pass without a transient
collision; ties fall back to the row id. Deleting the saved view, or the user,
deletes the pin through ``ON DELETE CASCADE``, so the saved-view delete path
needs no change and keeps working on a database that predates this table.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base


class SavedViewPin(Base):
    """One saved filter view shown as a Dashboard watch tile."""

    __tablename__ = "saved_view_pins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False
    )
    view_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("saved_filter_views.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )

    # The unique pair also serves every user-scoped read (user_id leads it).
    __table_args__ = (UniqueConstraint("user_id", "view_id", name="uq_saved_view_pins_user_view"),)

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<SavedViewPin(view_id={self.view_id}, position={self.position})>"

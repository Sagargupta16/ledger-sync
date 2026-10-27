"""Links from rows an import created to the IDs the source system gave them.

A Money Manager backup carries repeat rules and budgets with their own UIDs.
Each one imported becomes a local row (a scheduled transaction or a budget)
and one row here, so the next backup updates the same local row instead of
adding a copy. ``local_id`` is the local row's primary key in the table that
``kind`` names; it is not a foreign key because the kinds live in different
tables. ``fingerprint`` hashes the values the import last wrote, so an edit
made in Ledger Sync afterwards is detected and kept. A row with no link here
was created by hand, and imports never change it.
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base


class ExternalRef(Base):
    """One source UID, mapped to the local row it was imported as."""

    __tablename__ = "external_refs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    # "money_manager" today.
    source_system: Mapped[str] = mapped_column(String(32), nullable=False)
    # "repeat_rule" (scheduled_transactions) or "budget" (budgets).
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    source_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    local_id: Mapped[int] = mapped_column(Integer, nullable=False)
    # SHA-256 hex of the imported values, as the import last wrote them.
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        # Leading user_id also serves every lookup the importer makes.
        UniqueConstraint(
            "user_id",
            "source_system",
            "kind",
            "source_uid",
            name="uq_external_refs_user_source_kind_uid",
        ),
    )

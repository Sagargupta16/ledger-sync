"""CategorizationRule, TransactionTag, SavedFilterView models.

Organization features: user-defined categorization rules applied at
import time (pre-hash) and on demand, free-string transaction tags,
and named saved filter views for the Transactions page.
"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base

if TYPE_CHECKING:
    from ledger_sync.db._models.user import User


class CategorizationRule(Base):
    """User-defined "field contains pattern -> set category" rule.

    Rules are evaluated case-insensitively, first-match-wins, ordered by
    (sort_order asc, id asc). ``match_field`` is either ``note`` or
    ``account`` -- validated at the API layer, stored as a plain string.
    On match, both ``category`` AND ``subcategory`` are applied
    (``subcategory=None`` clears it).
    """

    __tablename__ = "categorization_rules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes rule to owner
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False
    )

    match_field: Mapped[str] = mapped_column(String(20), nullable=False, default="note")
    pattern: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(255), nullable=False)
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relationship back to user
    user: Mapped["User"] = relationship("User", back_populates="categorization_rules")

    __table_args__ = (Index("ix_categorization_rules_user", "user_id"),)

    def __repr__(self) -> str:
        """Return string representation."""
        return (
            f"<CategorizationRule(id={self.id}, {self.match_field} ~ "
            f"{self.pattern!r} -> {self.category})>"
        )


class TransactionTag(Base):
    """Free-string tag attached to a transaction.

    One row per (transaction, tag). Tags are case-sensitive exact
    strings stored trimmed. No separate lookup table: filtering uses an
    EXISTS subquery, facets use GROUP BY tag.
    """

    __tablename__ = "transaction_tags"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes tag to owner
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False
    )
    transaction_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("transactions.transaction_id", ondelete="CASCADE"),
        nullable=False,
    )
    tag: Mapped[str] = mapped_column(String(100), nullable=False)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )

    # Relationship back to user
    user: Mapped["User"] = relationship("User", back_populates="transaction_tags")

    __table_args__ = (
        Index(
            "ix_transaction_tags_user_txn_tag",
            "user_id",
            "transaction_id",
            "tag",
            unique=True,
        ),
        Index("ix_transaction_tags_user_tag", "user_id", "tag"),
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<TransactionTag(txn={self.transaction_id[:8]}..., tag={self.tag!r})>"


class SavedFilterView(Base):
    """Named snapshot of the Transactions page filter state.

    ``filters`` is an opaque JSON string (the frontend FilterValues
    object verbatim) -- the backend never inspects its keys, so new
    frontend filter fields require zero backend changes. One view per
    (user, name); POST upserts by name.
    """

    __tablename__ = "saved_filter_views"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes view to owner
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    filters: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    # Metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relationship back to user
    user: Mapped["User"] = relationship("User", back_populates="saved_filter_views")

    __table_args__ = (Index("ix_saved_filter_views_user_name", "user_id", "name", unique=True),)

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<SavedFilterView(id={self.id}, name={self.name!r})>"

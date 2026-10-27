"""Review-queue decisions per transaction, kept across re-imports.

One row says the user reviewed one transaction: kept the category the import
gave it (``keep``), or moved it to another one (``change``). A ``change`` row is
an override: every import applies it again after the categorization rules, so
the next full snapshot cannot undo the fix. Rows are keyed by the stable public
transaction ID, as tags are, and are removed with their transaction.
"""

from datetime import UTC, datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base

DECISION_KEEP = "keep"
DECISION_CHANGE = "change"


class CategoryOverride(Base):
    """The category a user confirmed or chose for one transaction."""

    __tablename__ = "category_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False
    )
    transaction_id: Mapped[str] = mapped_column(String(64), nullable=False)
    decision: Mapped[str] = mapped_column(String(10), nullable=False)
    # The label the user kept or chose.
    category: Mapped[str] = mapped_column(String(255), nullable=False)
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # The label the import gives the row after the rules, refreshed by every
    # import. Undo restores it, and a difference from ``category`` is exactly
    # where ledger-sync and the source file now disagree.
    imported_category: Mapped[str] = mapped_column(String(255), nullable=False)
    imported_subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "transaction_id"],
            ["transactions.user_id", "transactions.transaction_id"],
            name="fk_category_overrides_user_transaction",
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "user_id", "transaction_id", name="uq_category_overrides_user_transaction"
        ),
        CheckConstraint("decision IN ('keep', 'change')", name="ck_category_overrides_decision"),
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return (
            f"<CategoryOverride(txn={self.transaction_id[:8]}..., {self.decision} "
            f"-> {self.category!r})>"
        )

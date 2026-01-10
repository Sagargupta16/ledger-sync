"""SQLAlchemy ORM models."""

from datetime import UTC, datetime
from decimal import Decimal
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, Enum, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db.base import Base


class TransactionType(str, PyEnum):
    """Transaction type enumeration."""

    EXPENSE = "Expense"
    INCOME = "Income"
    TRANSFER = "Transfer"


class Transaction(Base):
    """Transaction model - represents a single financial transaction."""

    __tablename__ = "transactions"

    # Primary key - deterministic hash
    transaction_id: Mapped[str] = mapped_column(String(64), primary_key=True)

    # Core transaction fields
    date: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False, index=True)

    # Categorization
    account: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Optional fields
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata
    source_file: Mapped[str] = mapped_column(String(500), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC), index=True
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)

    # Create composite index for common queries
    __table_args__ = (
        Index("ix_transactions_date_type", "date", "type"),
        Index("ix_transactions_category_subcategory", "category", "subcategory"),
    )

    def __repr__(self) -> str:
        """String representation."""
        return (
            f"<Transaction(id={self.transaction_id[:8]}..., "
            f"date={self.date.date()}, "
            f"amount={self.amount}, "
            f"type={self.type.value})>"
        )


class ImportLog(Base):
    """Import log - tracks file imports for idempotency."""

    __tablename__ = "import_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    file_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    rows_processed: Mapped[int] = mapped_column(nullable=False, default=0)
    rows_inserted: Mapped[int] = mapped_column(nullable=False, default=0)
    rows_updated: Mapped[int] = mapped_column(nullable=False, default=0)
    rows_deleted: Mapped[int] = mapped_column(nullable=False, default=0)
    rows_skipped: Mapped[int] = mapped_column(nullable=False, default=0)

    def __repr__(self) -> str:
        """String representation."""
        return (
            f"<ImportLog(id={self.id}, "
            f"file={self.file_name}, "
            f"imported_at={self.imported_at})>"
        )

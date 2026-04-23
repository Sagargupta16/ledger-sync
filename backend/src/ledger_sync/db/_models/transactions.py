"""Transaction, ImportLog, AccountClassification, ColumnMappingLog models."""

from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db._models.enums import AccountType, TransactionType
from ledger_sync.db.base import Base

if TYPE_CHECKING:
    from ledger_sync.db._models.user import User


class Transaction(Base):
    """Transaction model - represents a single financial transaction."""

    __tablename__ = "transactions"

    # Primary key - deterministic hash
    transaction_id: Mapped[str] = mapped_column(String(64), primary_key=True)

    # User foreign key - links transaction to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Core transaction fields
    date: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False, index=True)

    # Categorization
    account: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Transfer-specific fields (only used when type=Transfer)
    from_account: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    to_account: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    # Optional fields
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata
    source_file: Mapped[str] = mapped_column(String(500), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)

    # Audit timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relationship back to user
    user: Mapped["User"] = relationship("User", back_populates="transactions")

    # Create composite indexes for common queries
    __table_args__ = (
        Index("ix_transactions_date_type", "date", "type"),
        Index("ix_transactions_category_subcategory", "category", "subcategory"),
        Index("ix_transactions_user_date", "user_id", "date"),
        Index("ix_transactions_user_deleted", "user_id", "is_deleted"),
        Index("ix_transactions_user_type_deleted", "user_id", "type", "is_deleted"),
        Index("ix_transactions_user_category", "user_id", "category"),
        Index("ix_transactions_user_date_type", "user_id", "date", "type"),
    )

    def __repr__(self) -> str:
        """Return string representation."""
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

    # User foreign key - links import to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    file_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    rows_processed: Mapped[int] = mapped_column(nullable=False, default=0)
    rows_inserted: Mapped[int] = mapped_column(nullable=False, default=0)
    rows_updated: Mapped[int] = mapped_column(nullable=False, default=0)
    rows_deleted: Mapped[int] = mapped_column(nullable=False, default=0)
    rows_skipped: Mapped[int] = mapped_column(nullable=False, default=0)

    # Relationship back to user
    user: Mapped["User"] = relationship("User", back_populates="import_logs")

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<ImportLog(id={self.id}, file={self.file_name}, imported_at={self.imported_at})>"


class AccountClassification(Base):
    """Account classification model - stores user-defined account types."""

    __tablename__ = "account_classifications"

    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True)

    # User foreign key - scopes classification to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Account name and classification
    account_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    account_type: Mapped[AccountType] = mapped_column(
        Enum(AccountType),
        nullable=False,
        default=AccountType.OTHER_WALLETS,
    )

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

    __table_args__ = (
        Index("ix_account_classification_user_account", "user_id", "account_name", unique=True),
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<AccountClassification(account={self.account_name}, type={self.account_type})>"


class ColumnMappingLog(Base):
    """Track Excel column mapping changes for debugging imports."""

    __tablename__ = "column_mapping_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # File info
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    # Column mappings found
    original_columns: Mapped[str] = mapped_column(Text, nullable=False)  # JSON list
    mapped_columns: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )  # JSON dict of original -> mapped
    unmapped_columns: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )  # JSON list of ignored columns

    # Validation results
    is_valid: Mapped[bool] = mapped_column(Boolean, nullable=False)
    validation_errors: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )  # JSON list of errors
    validation_warnings: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )  # JSON list of warnings

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

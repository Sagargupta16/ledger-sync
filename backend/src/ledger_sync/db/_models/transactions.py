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
    date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)

    # Categorization
    account: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(255), nullable=False)
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Transfer-specific fields (only used when type=Transfer)
    from_account: Mapped[str | None] = mapped_column(String(255), nullable=True)
    to_account: Mapped[str | None] = mapped_column(String(255), nullable=True)

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

    # Composite indexes. EVERY query in this app is user-scoped
    # (``WHERE user_id = ? AND is_deleted = false`` then a date range / type /
    # category / account filter), so all indexes lead with ``user_id`` and are
    # equality-first. Non-user-scoped indexes (date, type, category, ...) were
    # removed: the planner can never use them for user-scoped queries, so they
    # only taxed writes. See migration ``optimize_tx_indexes_2026``.
    #
    # NOTE: partial indexes (``WHERE is_deleted = false``) would shrink these
    # further (~63% of rows are soft-deleted) but the predicate-matching of
    # ``.is_(False)`` vs a ``= false`` partial differs between SQLite and
    # Postgres and can't be verified here -- left as a Postgres-verified
    # follow-up rather than shipped blind.
    __table_args__ = (
        # Primary analytics range scan: user's rows ordered/filtered by date.
        Index("ix_transactions_user_date", "user_id", "date"),
        # Type-filtered + date range (search endpoint, type rollups) -- type is
        # an equality filter so it leads the date range.
        Index("ix_transactions_user_type_date", "user_id", "type", "date"),
        # Category filter / breakdown.
        Index("ix_transactions_user_category", "user_id", "category"),
        # Account grouping (facets, account balances) + the account legs of the
        # search OR (account == X OR from_account == X OR to_account == X) and
        # transfer-flow aggregation.
        Index("ix_transactions_user_account", "user_id", "account"),
        Index("ix_transactions_user_from_account", "user_id", "from_account"),
        Index("ix_transactions_user_to_account", "user_id", "to_account"),
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

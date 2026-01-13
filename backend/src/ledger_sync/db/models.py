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

    # Transfer-specific fields (only used when type=Transfer)
    from_account: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    to_account: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

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


# Note: Transfer model deprecated - transfers now stored in transactions table with type='Transfer'
# Keeping class definition for backwards compatibility with migrations
# class Transfer(Base):
#     """Transfer model - represents money movement between accounts."""
#     # ... (removed to avoid TransferType reference errors)


class AccountType(str, PyEnum):
    """Account type enumeration."""

    CASH = "Cash"
    BANK_ACCOUNTS = "Bank Accounts"
    CREDIT_CARDS = "Credit Cards"
    INVESTMENTS = "Investments"
    LOANS = "Loans"
    OTHER_WALLETS = "Other Wallets"


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


class AccountClassification(Base):
    """Account classification model - stores user-defined account types."""

    __tablename__ = "account_classifications"

    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True)

    # Account name and classification
    account_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    account_type: Mapped[AccountType] = mapped_column(
        Enum(AccountType), nullable=False, default=AccountType.OTHER_WALLETS
    )

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.now, onupdate=datetime.now
    )

    def __repr__(self) -> str:
        """String representation."""
        return f"<AccountClassification(account={self.account_name}, type={self.account_type})>"


class TaxRecord(Base):
    """Tax record model - stores tax information by financial year."""

    __tablename__ = "tax_records"

    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Financial year (e.g., "2022-23", "2023-24")
    financial_year: Mapped[str] = mapped_column(String(10), nullable=False, index=True)

    # Income components (all in INR)
    gross_salary: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    bonus: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    stipend: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    rsu: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    other_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    total_gross_income: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2), nullable=False
    )

    # Tax components
    tds_deducted: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    advance_tax: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    self_assessment_tax: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2), nullable=True
    )
    total_tax_paid: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)

    # Deductions
    standard_deduction: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2), nullable=True
    )
    section_80c: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    section_80d: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    other_deductions: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    total_deductions: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)

    # Net taxable income
    taxable_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)

    # Metadata
    source_file: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Composite index for FY queries
    __table_args__ = (Index("ix_tax_records_fy", "financial_year"),)

    def __repr__(self) -> str:
        """String representation."""
        return (
            f"<TaxRecord(id={self.id}, "
            f"fy={self.financial_year}, "
            f"gross={self.total_gross_income}, "
            f"tax_paid={self.total_tax_paid})>"
        )

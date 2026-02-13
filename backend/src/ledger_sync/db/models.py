"""SQLAlchemy ORM models."""

from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum as PyEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ledger_sync.db.base import Base

# Foreign key reference constant for user relationships
USER_FK = "users.id"

# =============================================================================
# USER AUTHENTICATION
# =============================================================================


class User(Base):
    """User model for authentication."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Relationships — use deferred loading to avoid loading all transactions on every user query
    transactions: Mapped["list[Transaction]"] = relationship(
        "Transaction", back_populates="user", lazy="select"
    )
    preferences: Mapped["UserPreferences | None"] = relationship(
        "UserPreferences", back_populates="user", uselist=False
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<User(id={self.id}, email={self.email})>"


# NOTE: Enum string values below are stored directly in the database.
# Renaming any value requires a data migration. The mixed casing
# (PascalCase for TransactionType, snake_case for AnomalyType, etc.)
# is intentional legacy and must be preserved for backwards compatibility.


class TransactionType(PyEnum):
    """Transaction type enumeration."""

    EXPENSE = "Expense"
    INCOME = "Income"
    TRANSFER = "Transfer"


class AnomalyType(PyEnum):
    """Anomaly type enumeration."""

    HIGH_EXPENSE = "high_expense"
    UNUSUAL_CATEGORY = "unusual_category"
    LARGE_TRANSFER = "large_transfer"
    DUPLICATE_SUSPECTED = "duplicate_suspected"
    MISSING_RECURRING = "missing_recurring"
    BUDGET_EXCEEDED = "budget_exceeded"


class RecurrenceFrequency(PyEnum):
    """Recurring transaction frequency."""

    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class GoalStatus(PyEnum):
    """Goal status enumeration."""

    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"
    CANCELLED = "cancelled"


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

    # Relationship back to user
    user: Mapped["User"] = relationship("User", back_populates="transactions")

    # Create composite indexes for common queries
    __table_args__ = (
        Index("ix_transactions_date_type", "date", "type"),
        Index("ix_transactions_category_subcategory", "category", "subcategory"),
        Index("ix_transactions_user_date", "user_id", "date"),
        Index("ix_transactions_user_deleted", "user_id", "is_deleted"),
        Index("ix_transactions_user_type_deleted", "user_id", "type", "is_deleted"),
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return (
            f"<Transaction(id={self.transaction_id[:8]}..., "
            f"date={self.date.date()}, "
            f"amount={self.amount}, "
            f"type={self.type.value})>"
        )


class AccountType(PyEnum):
    """Account type enumeration."""

    CASH = "Cash"
    BANK_ACCOUNTS = "Bank Accounts"
    CREDIT_CARDS = "Credit Cards"
    INVESTMENTS = "Investments"
    LOANS = "Loans/Lended"
    OTHER_WALLETS = "Other Wallets"


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

    def __repr__(self) -> str:
        """Return string representation."""
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


class TaxRecord(Base):
    """Tax record model - stores tax information by financial year."""

    __tablename__ = "tax_records"

    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes tax record to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Financial year (e.g., "2022-23", "2023-24")
    financial_year: Mapped[str] = mapped_column(String(10), nullable=False)

    # Income components (all in INR)
    gross_salary: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    bonus: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    stipend: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    rsu: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    other_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    total_gross_income: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2),
        nullable=False,
    )

    # Tax components
    tds_deducted: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    advance_tax: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=True)
    self_assessment_tax: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2),
        nullable=True,
    )
    total_tax_paid: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)

    # Deductions
    standard_deduction: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2),
        nullable=True,
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
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Composite index for FY queries scoped to user
    __table_args__ = (Index("ix_tax_records_user_fy", "user_id", "financial_year"),)

    def __repr__(self) -> str:
        """Return string representation."""
        return (
            f"<TaxRecord(id={self.id}, "
            f"fy={self.financial_year}, "
            f"gross={self.total_gross_income}, "
            f"tax_paid={self.total_tax_paid})>"
        )


# =============================================================================
# NET WORTH & INVESTMENT TRACKING
# =============================================================================


class NetWorthSnapshot(Base):
    """Point-in-time net worth snapshot - calculated after each upload."""

    __tablename__ = "net_worth_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes snapshot to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Snapshot date (typically end of month or upload date)
    snapshot_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)

    # Asset breakdown
    cash_and_bank: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    investments: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    mutual_funds: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    stocks: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    fixed_deposits: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    ppf_epf: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    other_assets: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)

    # Liability breakdown
    credit_card_outstanding: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2),
        default=0,
    )
    loans_payable: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    other_liabilities: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)

    # Calculated totals
    total_assets: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    total_liabilities: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2),
        nullable=False,
    )
    net_worth: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)

    # Change from previous snapshot
    net_worth_change: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    net_worth_change_pct: Mapped[float] = mapped_column(Float, default=0)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    source: Mapped[str] = mapped_column(String(50), default="upload")  # upload, manual, api

    # Composite index replaces redundant single-column indexes
    __table_args__ = (
        Index("ix_net_worth_user_date", "user_id", "snapshot_date"),
    )


class InvestmentHolding(Base):
    """Track investment holdings and their values."""

    __tablename__ = "investment_holdings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Investment details
    account: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    investment_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )  # stocks, mf, fd, etc.
    instrument_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Value tracking
    invested_amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    current_value: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    realized_gains: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    unrealized_gains: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)

    # Metadata
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (Index("ix_investment_account_type", "account", "investment_type"),)


# =============================================================================
# MONTHLY & CATEGORY AGGREGATIONS (Pre-calculated for performance)
# =============================================================================


class MonthlySummary(Base):
    """Pre-calculated monthly summary - updated after each upload."""

    __tablename__ = "monthly_summaries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes summary to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Period identification
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    period_key: Mapped[str] = mapped_column(
        String(7),
        nullable=False,
        index=True,
    )  # YYYY-MM

    # Income breakdown
    total_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    salary_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    investment_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    other_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)

    # Expense breakdown
    total_expenses: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    essential_expenses: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    discretionary_expenses: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2),
        default=0,
    )

    # Transfer totals
    total_transfers_out: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    total_transfers_in: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    net_investment_flow: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)

    # Calculated metrics
    net_savings: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    savings_rate: Mapped[float] = mapped_column(Float, default=0)
    expense_ratio: Mapped[float] = mapped_column(Float, default=0)

    # Transaction counts
    income_count: Mapped[int] = mapped_column(Integer, default=0)
    expense_count: Mapped[int] = mapped_column(Integer, default=0)
    transfer_count: Mapped[int] = mapped_column(Integer, default=0)
    total_transactions: Mapped[int] = mapped_column(Integer, default=0)

    # Comparison with previous month
    income_change_pct: Mapped[float] = mapped_column(Float, default=0)
    expense_change_pct: Mapped[float] = mapped_column(Float, default=0)

    # Metadata
    last_calculated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

    __table_args__ = (
        Index("ix_monthly_summary_year_month", "year", "month"),
        Index("ix_monthly_summary_user_period", "user_id", "period_key", unique=True),
    )


class CategoryTrend(Base):
    """Category-level monthly trends for time series analysis."""

    __tablename__ = "category_trends"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes trend to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Period and category
    period_key: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # YYYY-MM
    category: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    transaction_type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)

    # Aggregated values
    total_amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    transaction_count: Mapped[int] = mapped_column(Integer, default=0)
    avg_transaction: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    max_transaction: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    min_transaction: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)

    # Percentage of total for the month
    pct_of_monthly_total: Mapped[float] = mapped_column(Float, default=0)

    # Month-over-month change
    mom_change: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    mom_change_pct: Mapped[float] = mapped_column(Float, default=0)

    last_calculated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

    __table_args__ = (
        Index("ix_category_trend_period_category", "period_key", "category"),
        Index("ix_category_trend_type", "transaction_type"),
        Index("ix_category_trend_user", "user_id"),
    )


# =============================================================================
# TRANSFER FLOW ANALYSIS
# =============================================================================


class TransferFlow(Base):
    """Aggregated transfer flows between accounts."""

    __tablename__ = "transfer_flows"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes flow to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Flow identification
    from_account: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    to_account: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # Aggregated values (all-time)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    transaction_count: Mapped[int] = mapped_column(Integer, default=0)
    avg_transfer: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)

    # Recent activity
    last_transfer_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_transfer_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(precision=15, scale=2),
        nullable=True,
    )

    # Account types (for Sankey diagram coloring)
    from_account_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_account_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    last_calculated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

    __table_args__ = (
        Index("ix_transfer_flow_accounts", "user_id", "from_account", "to_account", unique=True),
    )


# =============================================================================
# RECURRING TRANSACTIONS & PATTERNS
# =============================================================================


class RecurringTransaction(Base):
    """Detected recurring transactions (subscriptions, bills, salary, etc.)."""

    __tablename__ = "recurring_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes pattern to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Pattern identification
    pattern_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(255), nullable=False)
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account: Mapped[str] = mapped_column(String(255), nullable=False)
    transaction_type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)

    # Recurrence details
    frequency: Mapped[RecurrenceFrequency] = mapped_column(
        Enum(RecurrenceFrequency),
        nullable=False,
    )
    expected_amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    amount_variance: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2),
        default=0,
    )  # Allowed variance
    expected_day: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Day of month/week

    # Detection confidence
    confidence_score: Mapped[float] = mapped_column(Float, default=0)  # 0-100
    occurrences_detected: Mapped[int] = mapped_column(Integer, default=0)

    # Tracking
    last_occurrence: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_expected: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    times_missed: Mapped[int] = mapped_column(Integer, default=0)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_user_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Metadata
    first_detected: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

    __table_args__ = (
        Index("ix_recurring_category_account", "category", "account"),
        Index("ix_recurring_user", "user_id"),
    )


class MerchantIntelligence(Base):
    """Aggregated merchant/vendor intelligence."""

    __tablename__ = "merchant_intelligence"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes merchant data to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Merchant identification (extracted from notes)
    merchant_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    merchant_aliases: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )  # JSON list of variations

    # Primary category
    primary_category: Mapped[str] = mapped_column(String(255), nullable=False)
    primary_subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Aggregated stats
    total_spent: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    transaction_count: Mapped[int] = mapped_column(Integer, default=0)
    avg_transaction: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)

    # Activity tracking
    first_transaction: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_transaction: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    months_active: Mapped[int] = mapped_column(Integer, default=0)

    # Frequency analysis
    avg_days_between: Mapped[float] = mapped_column(Float, default=0)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)

    last_calculated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))


# =============================================================================
# ANOMALY DETECTION
# =============================================================================


class Anomaly(Base):
    """Detected anomalies and unusual patterns."""

    __tablename__ = "anomalies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes anomaly to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Anomaly details
    anomaly_type: Mapped[AnomalyType] = mapped_column(Enum(AnomalyType), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)  # low, medium, high, critical
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # Related transaction (if applicable)
    transaction_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("transactions.transaction_id"),
        nullable=True,
    )

    # Period (for monthly anomalies)
    period_key: Mapped[str | None] = mapped_column(String(7), nullable=True)  # YYYY-MM

    # Detection metrics
    expected_value: Mapped[Decimal | None] = mapped_column(
        Numeric(precision=15, scale=2),
        nullable=True,
    )
    actual_value: Mapped[Decimal | None] = mapped_column(
        Numeric(precision=15, scale=2),
        nullable=True,
    )
    deviation_pct: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Status
    is_reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_anomaly_type_severity", "anomaly_type", "severity"),
        Index("ix_anomaly_period", "period_key"),
        Index("ix_anomaly_user", "user_id"),
    )


# =============================================================================
# BUDGETS & GOALS
# =============================================================================


class Budget(Base):
    """Budget tracking per category."""

    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes budget to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Budget scope
    category: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Budget amounts
    monthly_limit: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    alert_threshold_pct: Mapped[float] = mapped_column(Float, default=80)  # Alert when 80% consumed

    # Current period tracking
    current_month_spent: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    current_month_remaining: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2),
        default=0,
    )
    current_month_pct: Mapped[float] = mapped_column(Float, default=0)

    # Historical performance
    avg_monthly_actual: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    months_over_budget: Mapped[int] = mapped_column(Integer, default=0)
    months_under_budget: Mapped[int] = mapped_column(Integer, default=0)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))


class FinancialGoal(Base):
    """Financial goals tracking."""

    __tablename__ = "financial_goals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes goal to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Goal details
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    goal_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )  # savings, investment, debt_payoff, custom

    # Target
    target_amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    current_amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    target_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Progress
    progress_pct: Mapped[float] = mapped_column(Float, default=0)
    monthly_target: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    on_track: Mapped[bool] = mapped_column(Boolean, default=True)

    # Status
    status: Mapped[GoalStatus] = mapped_column(Enum(GoalStatus), default=GoalStatus.ACTIVE)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# =============================================================================
# FISCAL YEAR SUMMARIES (India: Apr-Mar)
# =============================================================================


class FYSummary(Base):
    """Fiscal year summary (April to March for India)."""

    __tablename__ = "fy_summaries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes FY summary to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # FY identification (e.g., "FY2024-25" for Apr 2024 - Mar 2025)
    fiscal_year: Mapped[str] = mapped_column(String(15), nullable=False, index=True)
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    # Income summary
    total_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    salary_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    bonus_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    investment_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    other_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)

    # Expense summary
    total_expenses: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    tax_paid: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    investments_made: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)

    # Net position
    net_savings: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    savings_rate: Mapped[float] = mapped_column(Float, default=0)

    # YoY comparison
    yoy_income_change: Mapped[float] = mapped_column(Float, default=0)
    yoy_expense_change: Mapped[float] = mapped_column(Float, default=0)
    yoy_savings_change: Mapped[float] = mapped_column(Float, default=0)

    # Metadata
    last_calculated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    is_complete: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )  # False if FY is still ongoing


# =============================================================================
# AUDIT LOGGING
# =============================================================================


class AuditLog(Base):
    """Audit log for tracking all changes and operations."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Operation details
    operation: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )  # upload, reconcile, edit, delete
    entity_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )  # transaction, budget, goal, etc.
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Change details
    action: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )  # create, update, delete, soft_delete
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON of old state
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON of new state
    changes_summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )  # Human-readable summary

    # Context
    source_file: Mapped[str | None] = mapped_column(String(500), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        index=True,
    )

    __table_args__ = (
        Index("ix_audit_operation_entity", "operation", "entity_type"),
        Index("ix_audit_created", "created_at"),
    )


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


# Default JSON values for UserPreferences - empty by default for new users
# Users should configure these based on their actual data after first upload
_DEFAULT_ESSENTIAL_CATEGORIES = "[]"
_DEFAULT_INVESTMENT_MAPPINGS = "{}"


class UserPreferences(Base):
    """User preferences for customizing analytics and display.

    Stores all user-configurable settings per user.
    JSON fields allow flexible storage of lists/dicts without schema changes.
    """

    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - links preferences to owner
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK), nullable=False, unique=True, index=True
    )

    # Relationship back to user
    user: Mapped["User"] = relationship("User", back_populates="preferences")

    # ===== 1. Fiscal Year Configuration =====
    fiscal_year_start_month: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=4,  # April (India FY)
    )

    # ===== 2. Essential vs Discretionary Categories =====
    # JSON array of category names
    essential_categories: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default=_DEFAULT_ESSENTIAL_CATEGORIES,
    )
    # Categories not in essential are considered discretionary

    # ===== 3. Investment Account Mappings =====
    # JSON object: account_pattern -> investment_type
    # Types: stocks, mutual_funds, fixed_deposits, ppf_epf, gold, crypto, other
    investment_account_mappings: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default=_DEFAULT_INVESTMENT_MAPPINGS,
    )

    # ===== 4. Income Classification by Tax Treatment =====
    # Classify income subcategories by their tax treatment
    # Stored as "Category::Subcategory" format for granular control
    taxable_income_categories: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        # Empty by default - user configures based on their data
        default="[]",
    )
    investment_returns_categories: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        # Empty by default - user configures based on their data
        default="[]",
    )
    non_taxable_income_categories: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        # Empty by default - user configures based on their data
        default="[]",
    )
    other_income_categories: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        # Empty by default - user configures based on their data
        default="[]",
    )

    # ===== 5. Budget Defaults =====
    default_budget_alert_threshold: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=80.0,  # Alert at 80% usage
    )
    auto_create_budgets: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    budget_rollover_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ===== 6. Display/Format Preferences =====
    number_format: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="indian",  # "indian" or "international"
    )  # indian: 1,00,000 | international: 100,000
    currency_symbol: Mapped[str] = mapped_column(String(10), nullable=False, default="₹")
    currency_symbol_position: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="before",  # "before" or "after"
    )
    default_time_range: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="all_time",
    )

    # ===== 7. Anomaly Detection Settings =====
    anomaly_expense_threshold: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=2.0,  # Flag if expense > 2x category average
    )
    anomaly_types_enabled: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default='["high_expense", "unusual_category", "large_transfer", "budget_exceeded"]',
    )
    auto_dismiss_recurring_anomalies: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    # ===== 8. Recurring Transaction Settings =====
    recurring_min_confidence: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=50.0,  # Min confidence % to show
    )
    recurring_auto_confirm_occurrences: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=6,  # Auto-confirm after 6 occurrences
    )

    # ===== 9. Spending Rule Targets (Needs/Wants/Savings) =====
    needs_target_percent: Mapped[float] = mapped_column(Float, nullable=False, default=50.0)
    wants_target_percent: Mapped[float] = mapped_column(Float, nullable=False, default=30.0)
    savings_target_percent: Mapped[float] = mapped_column(Float, nullable=False, default=20.0)

    # ===== 10. Credit Card Limits =====
    # JSON object: { "card_name": limit_amount }
    credit_card_limits: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    # ===== 11. Earning Start Date =====
    earning_start_date: Mapped[str | None] = mapped_column(String(10), nullable=True, default=None)
    use_earning_start_date: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

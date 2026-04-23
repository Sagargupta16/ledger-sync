"""Pre-aggregated analytics tables.

DailySummary, MonthlySummary, CategoryTrend, TransferFlow, MerchantIntelligence,
and FYSummary are populated by ``core.analytics_engine`` after each upload.
"""

from datetime import UTC, datetime
from decimal import Decimal

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
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db._models.enums import TransactionType
from ledger_sync.db.base import Base


class DailySummary(Base):
    """Pre-calculated daily summary - updated after each upload.

    Provides daily-level aggregations for heatmaps, daily trend charts, and
    any UI that needs per-day totals without scanning raw transactions.
    """

    __tablename__ = "daily_summaries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes summary to owner
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(USER_FK), nullable=False, index=True)

    # Date identification
    date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD

    # Income & Expense totals
    total_income: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    total_expenses: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)
    net: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), default=0)

    # Transaction counts
    income_count: Mapped[int] = mapped_column(Integer, default=0)
    expense_count: Mapped[int] = mapped_column(Integer, default=0)
    transfer_count: Mapped[int] = mapped_column(Integer, default=0)
    total_transactions: Mapped[int] = mapped_column(Integer, default=0)

    # Top category for the day (by expense amount)
    top_category: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Metadata
    last_calculated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

    __table_args__ = (Index("ix_daily_summary_user_date", "user_id", "date", unique=True),)


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

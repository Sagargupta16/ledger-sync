"""NetWorthSnapshot, InvestmentHolding, and TaxRecord models."""

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base


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

    # Audit timestamps
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        server_default="2026-01-01",
    )

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

    # Unique per user per day — prevents duplicate snapshots on re-upload
    __table_args__ = (
        Index("ix_net_worth_user_date", "user_id", "snapshot_date"),
        UniqueConstraint("user_id", "snapshot_date", name="uq_net_worth_user_date"),
    )


class InvestmentHolding(Base):
    """Track investment holdings and their values."""

    __tablename__ = "investment_holdings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes holding to owner
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(USER_FK, ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

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

    __table_args__ = (
        Index("ix_investment_account_type", "account", "investment_type"),
        Index("ix_investment_user", "user_id"),
    )

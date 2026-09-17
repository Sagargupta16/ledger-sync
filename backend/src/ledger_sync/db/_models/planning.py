"""Recurring patterns, scheduled transactions, anomalies, budgets, and goals."""

from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db._models.enums import (
    AnomalyType,
    GoalStatus,
    RecurrenceFrequency,
    TransactionType,
)
from ledger_sync.db.base import Base

if TYPE_CHECKING:
    from ledger_sync.db._models.user import User


class RecurringTransaction(Base):
    """Detected recurring transactions (subscriptions, bills, salary, etc.)."""

    __tablename__ = "recurring_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes pattern to owner
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False, index=True
    )

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

    # "commitment" = a bill/salary you owe or are owed on a calendar date.
    # "habit" = a repeated discretionary purchase (the daily lunch, the weekly
    # fruit run). Both are genuinely periodic, so a gap-regularity score cannot
    # separate them -- but only a commitment belongs in fixed-cost totals, the
    # bill calendar or a missed-payment alert. Stored as a plain String rather
    # than an Enum so a new kind needs no migration.
    pattern_kind: Mapped[str] = mapped_column(String(16), default="commitment")

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
        Index("uq_recurring_transactions_user_id", "user_id", "id", unique=True),
        Index("ix_recurring_category_account", "category", "account"),
    )


class ScheduledTransaction(Base):
    """Future planned transactions — SIPs, EMIs, salaries, subscriptions.

    These are user-defined or auto-detected from RecurringTransaction patterns.
    They represent expected future cash flows and are excluded from historical charts.
    """

    __tablename__ = "scheduled_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False, index=True
    )

    # What
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)
    category: Mapped[str] = mapped_column(String(255), nullable=False)
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account: Mapped[str] = mapped_column(String(255), nullable=False)

    # When
    frequency: Mapped[RecurrenceFrequency] = mapped_column(
        Enum(RecurrenceFrequency),
        nullable=False,
    )
    expected_day: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Day of month (1-31)
    next_due_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # Null = no end

    # Linking
    recurring_transaction_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )  # Auto-detected source

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "recurring_transaction_id"],
            ["recurring_transactions.user_id", "recurring_transactions.id"],
            name="fk_scheduled_user_recurring",
        ),
        Index("ix_scheduled_user_active", "user_id", "is_active"),
        Index("ix_scheduled_user_active_due", "user_id", "is_active", "next_due_date"),
    )


class Anomaly(Base):
    """Detected anomalies and unusual patterns."""

    __tablename__ = "anomalies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes anomaly to owner
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False, index=True
    )

    # Anomaly details
    anomaly_type: Mapped[AnomalyType] = mapped_column(Enum(AnomalyType), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)  # low, medium, high, critical
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # Related transaction (if applicable). Cascade on delete: hard-deleting a
    # transaction should not leave orphaned anomalies pointing at nothing.
    transaction_id: Mapped[str | None] = mapped_column(
        String(64),
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

    # Relationship back to user
    user: Mapped["User"] = relationship("User", back_populates="anomalies")

    # Metadata
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "transaction_id"],
            ["transactions.user_id", "transactions.transaction_id"],
            name="fk_anomalies_user_transaction",
            ondelete="CASCADE",
        ),
        Index("ix_anomaly_type_severity", "anomaly_type", "severity"),
        Index("ix_anomaly_period", "period_key"),
    )


class Budget(Base):
    """Budget tracking per category."""

    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes budget to owner
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False, index=True
    )

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

    # Relationship back to user
    user: Mapped["User"] = relationship("User", back_populates="budgets")

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        # Inactive budgets retain their scope, as under the original constraint.
        Index(
            "uq_budget_user_category_null",
            "user_id",
            "category",
            unique=True,
            sqlite_where=text("subcategory IS NULL"),
            postgresql_where=text("subcategory IS NULL"),
        ),
        Index(
            "uq_budget_user_category_subcategory",
            "user_id",
            "category",
            "subcategory",
            unique=True,
            sqlite_where=text("subcategory IS NOT NULL"),
            postgresql_where=text("subcategory IS NOT NULL"),
        ),
        CheckConstraint("monthly_limit > 0", name="ck_budget_limit_positive"),
        Index("ix_budget_user_category", "user_id", "category"),
    )


class FinancialGoal(Base):
    """Financial goals tracking."""

    __tablename__ = "financial_goals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - scopes goal to owner
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False, index=True
    )

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

    # Relationship back to user
    user: Mapped["User"] = relationship("User", back_populates="financial_goals")

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        server_default="2026-01-01",
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (CheckConstraint("target_amount > 0", name="ck_goal_target_positive"),)

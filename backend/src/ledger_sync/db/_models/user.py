"""User, UserPreferences, and AuditLog models."""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ledger_sync.db._models._constants import CASCADE_ALL_DELETE_ORPHAN, USER_FK
from ledger_sync.db.base import Base

if TYPE_CHECKING:
    from ledger_sync.db._models.ai_usage import AIUsageLog
    from ledger_sync.db._models.planning import (
        Anomaly,
        Budget,
        FinancialGoal,
    )
    from ledger_sync.db._models.transactions import ImportLog, Transaction


class User(Base):
    """User model for authentication.

    Supports both email/password and OAuth (Google, GitHub) login.
    OAuth users have auth_provider and auth_provider_id set, and may
    have an empty hashed_password (they authenticate via the provider).
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # OAuth fields — null for email/password users
    auth_provider: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    auth_provider_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

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

    # Relationships — cascade ensures child records are cleaned up when a user is deleted.
    # lazy="select" avoids loading all children on every user query.
    transactions: Mapped["list[Transaction]"] = relationship(
        "Transaction",
        back_populates="user",
        lazy="select",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
    )
    preferences: Mapped["UserPreferences | None"] = relationship(
        "UserPreferences",
        back_populates="user",
        uselist=False,
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
    )
    import_logs: Mapped["list[ImportLog]"] = relationship(
        "ImportLog",
        back_populates="user",
        lazy="select",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
    )
    ai_usage_logs: Mapped["list[AIUsageLog]"] = relationship(
        "AIUsageLog",
        back_populates="user",
        lazy="select",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
    )
    budgets: Mapped["list[Budget]"] = relationship(
        "Budget",
        back_populates="user",
        lazy="select",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
    )
    financial_goals: Mapped["list[FinancialGoal]"] = relationship(
        "FinancialGoal",
        back_populates="user",
        lazy="select",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
    )
    anomalies: Mapped["list[Anomaly]"] = relationship(
        "Anomaly",
        back_populates="user",
        lazy="select",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
    )
    audit_logs: Mapped["list[AuditLog]"] = relationship(
        "AuditLog",
        back_populates="user",
        lazy="select",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<User(id={self.id}, email={self.email})>"


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
    display_currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
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

    # ===== 12. Fixed/Mandatory Monthly Expenses =====
    # JSON array of "Category::Subcategory" that are fixed every month
    # e.g. ["Housing::Rent", "Utilities::Internet", "Transportation::EMI"]
    fixed_expense_categories: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    # ===== 13. Savings & Investment Targets =====
    savings_goal_percent: Mapped[float] = mapped_column(Float, nullable=False, default=20.0)
    monthly_investment_target: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # ===== 14. Payday Configuration =====
    payday: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # ===== 15. Tax Regime Preference =====
    preferred_tax_regime: Mapped[str] = mapped_column(String(10), nullable=False, default="new")

    # ===== 16. Excluded Accounts =====
    # JSON array of account names to exclude from analytics
    excluded_accounts: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    # ===== 17. Notification Preferences =====
    notify_budget_alerts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_anomalies: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_upcoming_bills: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_days_ahead: Mapped[int] = mapped_column(Integer, nullable=False, default=7)

    # ── Salary & Tax Projections ──────────────────────────────────────────
    salary_structure: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    rsu_grants: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    growth_assumptions: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    # ── AI Assistant Configuration ───────────────────────────────────────
    # Two modes:
    #   "app_bedrock" (default) -- user uses the app's shared Bedrock bearer
    #     token. Rate-limited to LEDGER_SYNC_AI_DAILY_MESSAGE_LIMIT messages
    #     per day (we pay the AWS bill). Model is fixed by the app
    #     (LEDGER_SYNC_AI_DEFAULT_BEDROCK_MODEL).
    #   "byok" -- user brings their own OpenAI / Anthropic / Bedrock key.
    #     Picks provider + model themselves, pays their own provider bill,
    #     and gets optional per-user token caps for self-control.
    ai_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default="app_bedrock", server_default="app_bedrock"
    )
    ai_provider: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    ai_model: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)
    ai_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    # BYOK-only token budgets. Nullable -> no limit. In app_bedrock mode the
    # message cap comes from settings.ai_daily_message_limit instead.
    ai_daily_token_limit: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    ai_monthly_token_limit: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class AuditLog(Base):
    """Audit log for tracking all changes and operations."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # User foreign key - tracks who performed the action
    user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey(USER_FK, ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Relationship back to user
    user: Mapped["User | None"] = relationship("User", back_populates="audit_logs")

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
        Index("ix_audit_user", "user_id"),
    )

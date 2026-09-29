"""Pydantic request/response models for the preferences endpoints.

Split out of ``preferences_helpers`` (which re-exports every name here, so
existing ``from ledger_sync.api.preferences_helpers import ...`` keeps working).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from ledger_sync.services.account_settings import validate_credit_limit

# ----- Pydantic Models -----

CreditLimit = Annotated[Decimal, BeforeValidator(validate_credit_limit)]


class FiscalYearConfig(BaseModel):
    """Fiscal year configuration."""

    fiscal_year_start_month: int = Field(
        ge=1,
        le=12,
        description="Month number (1-12) when fiscal year starts",
    )


class EssentialCategoriesConfig(BaseModel):
    """Essential vs discretionary categories configuration."""

    essential_categories: list[str] = Field(
        description="List of category names considered essential/non-discretionary",
    )


class InvestmentMappingsConfig(BaseModel):
    """Investment account to type mappings."""

    investment_account_mappings: dict[str, str] = Field(
        description="Map of account name to investment type (stocks, mutual_funds, etc.)",
    )


class IncomeSourcesConfig(BaseModel):
    """Income classification by tax treatment."""

    taxable_income_categories: list[str] = Field(
        description="Income category names that are taxable (e.g., Employment Income)",
    )
    investment_returns_categories: list[str] = Field(
        description="Income categories from investments (may have different tax treatment)",
    )
    non_taxable_income_categories: list[str] = Field(
        description="Non-taxable income categories (refunds, cashbacks)",
    )
    other_income_categories: list[str] = Field(
        description="Other/miscellaneous income categories",
    )


class CapitalLossConfig(BaseModel):
    """Expense categories that are really realised investment losses."""

    capital_loss_categories: list[str] = Field(
        description="'Category::Subcategory' keys booked as EXPENSE that are realised "
        "investment losses, not consumption. Excluded from expense totals, the "
        "essential/discretionary split and the anomaly baseline once set. Empty by "
        "default so nothing is reclassified without the user asking.",
    )


class BudgetDefaultsConfig(BaseModel):
    """Budget default settings."""

    default_budget_alert_threshold: float = Field(
        ge=0,
        le=100,
        description="Alert when budget usage exceeds this percentage",
    )
    auto_create_budgets: bool = Field(description="Auto-create budgets from spending patterns")
    budget_rollover_enabled: bool = Field(description="Roll over unused budget to next month")


class DisplayPreferencesConfig(BaseModel):
    """Display and format preferences."""

    number_format: str = Field(description="Number format: 'indian' or 'international'")
    currency_symbol: str = Field(description="Currency symbol to display")
    currency_symbol_position: str = Field(description="Symbol position: 'before' or 'after'")
    default_time_range: str = Field(
        description="Default time range: 'last_3_months', 'last_6_months', "
        "'last_12_months', 'current_fy', 'all_time'",
    )
    display_currency: str = Field(
        default="INR",
        min_length=3,
        max_length=3,
        description="ISO 4217 currency code for display conversion",
    )


class AnomalySettingsConfig(BaseModel):
    """Anomaly detection settings."""

    anomaly_expense_threshold: float = Field(
        ge=1.0,
        le=10.0,
        description="Standard deviations for expense anomaly detection",
    )
    anomaly_types_enabled: list[str] = Field(
        description="Enabled anomaly types: high_expense, unusual_category, "
        "large_transfer, budget_exceeded",
    )
    auto_dismiss_recurring_anomalies: bool = Field(
        description="Auto-dismiss anomalies that match recurring patterns",
    )


class RecurringSettingsConfig(BaseModel):
    """Recurring transaction detection settings."""

    recurring_min_confidence: float = Field(
        ge=0,
        le=100,
        description="Minimum confidence % to flag as recurring",
    )
    recurring_auto_confirm_occurrences: int = Field(
        ge=2,
        le=12,
        description="Auto-confirm recurring after this many occurrences",
    )


class SpendingRuleConfig(BaseModel):
    """Spending rule target percentages (Needs/Wants/Savings)."""

    needs_target_percent: float = Field(
        ge=0,
        le=100,
        description="Target percentage of income for needs/essentials",
    )
    wants_target_percent: float = Field(
        ge=0,
        le=100,
        description="Target percentage of income for wants/discretionary",
    )
    savings_target_percent: float = Field(
        ge=0,
        le=100,
        description="Target percentage of income for savings",
    )


class CreditCardLimitsConfig(BaseModel):
    """Credit card limit settings."""

    credit_card_limits: dict[str, CreditLimit] = Field(
        description="Map of credit card name to credit limit amount",
    )


class EarningStartDateConfig(BaseModel):
    """Earning start date configuration."""

    earning_start_date: str | None = Field(
        default=None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Earning start date in YYYY-MM-DD format",
    )
    use_earning_start_date: bool = Field(
        default=False,
        description="Whether to use earning start date as global analytics filter",
    )


class UserPreferencesResponse(BaseModel):
    """Full user preferences response."""

    id: int

    # 1. Fiscal Year
    fiscal_year_start_month: int

    # 2. Essential Categories
    essential_categories: list[str]

    # 3. Investment Mappings
    investment_account_mappings: dict[str, str]

    # 4. Income Classification (by tax treatment)
    taxable_income_categories: list[str]
    investment_returns_categories: list[str]
    non_taxable_income_categories: list[str]
    other_income_categories: list[str]

    # 4b. Realised capital losses booked as EXPENSE
    capital_loss_categories: list[str] = []

    # 5. Budget Defaults
    default_budget_alert_threshold: float
    auto_create_budgets: bool
    budget_rollover_enabled: bool

    # 6. Display Preferences
    number_format: str
    currency_symbol: str
    currency_symbol_position: str
    default_time_range: str
    display_currency: str = "INR"

    # 7. Anomaly Settings
    anomaly_expense_threshold: float
    anomaly_types_enabled: list[str]
    auto_dismiss_recurring_anomalies: bool

    # 8. Recurring Settings
    recurring_min_confidence: float
    recurring_auto_confirm_occurrences: int

    # 9. Spending Rule Targets
    needs_target_percent: float
    wants_target_percent: float
    savings_target_percent: float

    # 10. Credit Card Limits
    credit_card_limits: dict[str, float]

    # 11. Earning Start Date
    earning_start_date: str | None = None
    use_earning_start_date: bool = False

    # 12. Fixed/Mandatory Monthly Expenses
    fixed_expense_categories: list[str] = []

    # 13. Savings & Investment Targets
    savings_goal_percent: float = 20.0
    monthly_investment_target: float = 0.0

    # 14. Payday Configuration
    payday: int = 1

    # 15. Tax Regime Preference
    preferred_tax_regime: str = "new"

    # 16. Excluded Accounts
    excluded_accounts: list[str] = []

    # 17. Notification Preferences
    notify_budget_alerts: bool = True
    notify_anomalies: bool = True
    notify_upcoming_bills: bool = True
    notify_days_ahead: int = 7

    # 18. Tax display
    show_tds_schedule: bool = False

    # 19. EPF withdrawal taxability
    epf_withdrawal_taxable: bool = False
    epf_taxable_percent: int = 100

    # 20. Salary TDS treatment
    salary_is_net_of_tds: bool = True

    # Salary & Tax Projections
    salary_structure: dict[str, Any] = {}
    rsu_grants: list[dict[str, Any]] = []
    growth_assumptions: dict[str, Any] = {}

    # Metadata
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class UserPreferencesUpdate(BaseModel):
    """Partial update model for preferences."""

    # 1. Fiscal Year
    fiscal_year_start_month: int | None = None

    # 2. Essential Categories
    essential_categories: list[str] | None = None

    # 3. Investment Mappings
    investment_account_mappings: dict[str, str] | None = None

    # 4. Income Classification (by tax treatment)
    taxable_income_categories: list[str] | None = None
    investment_returns_categories: list[str] | None = None
    non_taxable_income_categories: list[str] | None = None
    other_income_categories: list[str] | None = None

    # 4b. Realised capital losses booked as EXPENSE
    capital_loss_categories: list[str] | None = None

    # 5. Budget Defaults
    default_budget_alert_threshold: float | None = None
    auto_create_budgets: bool | None = None
    budget_rollover_enabled: bool | None = None

    # 6. Display Preferences
    number_format: str | None = None
    currency_symbol: str | None = None
    currency_symbol_position: str | None = None
    default_time_range: str | None = None
    display_currency: str | None = None

    # 7. Anomaly Settings
    anomaly_expense_threshold: float | None = None
    anomaly_types_enabled: list[str] | None = None
    auto_dismiss_recurring_anomalies: bool | None = None

    # 8. Recurring Settings
    recurring_min_confidence: float | None = None
    recurring_auto_confirm_occurrences: int | None = None

    # 9. Spending Rule Targets
    needs_target_percent: float | None = None
    wants_target_percent: float | None = None
    savings_target_percent: float | None = None

    # 10. Credit Card Limits
    credit_card_limits: dict[str, CreditLimit] | None = None

    # 11. Earning Start Date
    earning_start_date: str | None = None
    use_earning_start_date: bool | None = None

    # 12. Fixed/Mandatory Monthly Expenses
    fixed_expense_categories: list[str] | None = None

    # 13. Savings & Investment Targets
    savings_goal_percent: float | None = None
    monthly_investment_target: float | None = None

    # 14. Payday Configuration
    payday: int | None = None

    # 15. Tax Regime Preference
    preferred_tax_regime: str | None = None

    # 16. Excluded Accounts
    excluded_accounts: list[str] | None = None

    # 17. Notification Preferences
    notify_budget_alerts: bool | None = None
    notify_anomalies: bool | None = None
    notify_upcoming_bills: bool | None = None
    notify_days_ahead: int | None = None

    # 18. Tax display
    show_tds_schedule: bool | None = None

    # 19. EPF withdrawal taxability
    epf_withdrawal_taxable: bool | None = None
    epf_taxable_percent: int | None = Field(default=None, ge=0, le=100)

    # 20. Salary TDS treatment
    salary_is_net_of_tds: bool | None = None

    # Salary & Tax Projections
    salary_structure: dict[str, Any] | None = None
    rsu_grants: list[dict[str, Any]] | None = None
    growth_assumptions: dict[str, Any] | None = None

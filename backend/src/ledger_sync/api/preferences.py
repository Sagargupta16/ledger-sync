"""User Preferences API endpoints.

Provides CRUD operations for user preferences including:
- Fiscal year configuration
- Essential vs discretionary categories
- Investment account mappings
- Income source categories
- Budget defaults
- Display/format preferences
- Anomaly detection settings
- Recurring transaction settings
"""

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import User, UserPreferences

router = APIRouter(prefix="/preferences", tags=["preferences"])


# ----- Pydantic Models -----


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

    credit_card_limits: dict[str, float] = Field(
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

    # 5. Budget Defaults
    default_budget_alert_threshold: float
    auto_create_budgets: bool
    budget_rollover_enabled: bool

    # 6. Display Preferences
    number_format: str
    currency_symbol: str
    currency_symbol_position: str
    default_time_range: str

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

    # 5. Budget Defaults
    default_budget_alert_threshold: float | None = None
    auto_create_budgets: bool | None = None
    budget_rollover_enabled: bool | None = None

    # 6. Display Preferences
    number_format: str | None = None
    currency_symbol: str | None = None
    currency_symbol_position: str | None = None
    default_time_range: str | None = None

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
    credit_card_limits: dict[str, float] | None = None

    # 11. Earning Start Date
    earning_start_date: str | None = None
    use_earning_start_date: bool | None = None


# ----- Helper Functions -----


def _parse_json_field(value: str | list | dict, default: Any = None) -> Any:
    """Parse JSON field if it's a string."""
    if default is None:
        default = []
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return default
    return value


def _model_to_response(prefs: UserPreferences) -> UserPreferencesResponse:
    """Convert SQLAlchemy model to Pydantic response."""
    return UserPreferencesResponse(
        id=prefs.id,
        fiscal_year_start_month=prefs.fiscal_year_start_month,
        essential_categories=_parse_json_field(prefs.essential_categories),
        investment_account_mappings=_parse_json_field(prefs.investment_account_mappings),
        taxable_income_categories=_parse_json_field(prefs.taxable_income_categories),
        investment_returns_categories=_parse_json_field(prefs.investment_returns_categories),
        non_taxable_income_categories=_parse_json_field(prefs.non_taxable_income_categories),
        other_income_categories=_parse_json_field(prefs.other_income_categories),
        default_budget_alert_threshold=prefs.default_budget_alert_threshold,
        auto_create_budgets=prefs.auto_create_budgets,
        budget_rollover_enabled=prefs.budget_rollover_enabled,
        number_format=prefs.number_format,
        currency_symbol=prefs.currency_symbol,
        currency_symbol_position=prefs.currency_symbol_position,
        default_time_range=prefs.default_time_range,
        anomaly_expense_threshold=prefs.anomaly_expense_threshold,
        anomaly_types_enabled=_parse_json_field(prefs.anomaly_types_enabled),
        auto_dismiss_recurring_anomalies=prefs.auto_dismiss_recurring_anomalies,
        recurring_min_confidence=prefs.recurring_min_confidence,
        recurring_auto_confirm_occurrences=prefs.recurring_auto_confirm_occurrences,
        needs_target_percent=prefs.needs_target_percent,
        wants_target_percent=prefs.wants_target_percent,
        savings_target_percent=prefs.savings_target_percent,
        credit_card_limits=_parse_json_field(prefs.credit_card_limits, {}),
        earning_start_date=prefs.earning_start_date,
        use_earning_start_date=prefs.use_earning_start_date,
        created_at=prefs.created_at,
        updated_at=prefs.updated_at,
    )


def _get_or_create_preferences(session: Session, user: User) -> UserPreferences:
    """Get existing preferences or create defaults for a user."""
    result = session.execute(select(UserPreferences).where(UserPreferences.user_id == user.id))
    prefs = result.scalar_one_or_none()

    if prefs is None:
        # Create default preferences for this user
        prefs = UserPreferences(user_id=user.id)
        session.add(prefs)
        session.commit()
        session.refresh(prefs)

    return prefs


def _update_section(
    session: Session,
    user: User,
    config: BaseModel,
    json_fields: set[str] | None = None,
) -> UserPreferencesResponse:
    """Generic helper to update a preferences section.

    Args:
        session: Database session.
        user: The authenticated user.
        config: Pydantic model with the fields to update.
        json_fields: Field names whose values must be JSON-serialised before storage.

    Returns:
        Full preferences response after the update.

    """
    prefs = _get_or_create_preferences(session, user)
    for field, value in config.model_dump().items():
        if json_fields and field in json_fields:
            value = json.dumps(value)
        setattr(prefs, field, value)
    prefs.updated_at = datetime.now(UTC)
    session.commit()
    session.refresh(prefs)
    return _model_to_response(prefs)


# ----- API Endpoints -----


@router.get("")
def get_preferences(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Get current user preferences."""
    prefs = _get_or_create_preferences(session, current_user)
    return _model_to_response(prefs)


@router.put("")
def update_preferences(
    current_user: CurrentUser,
    updates: UserPreferencesUpdate,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update user preferences (partial update supported)."""
    prefs = _get_or_create_preferences(session, current_user)

    # Apply updates for non-None fields
    update_data = updates.model_dump(exclude_none=True)

    for field, value in update_data.items():
        # Convert lists/dicts to JSON strings for storage
        if isinstance(value, (list, dict)):
            value = json.dumps(value)
        setattr(prefs, field, value)

    prefs.updated_at = datetime.now(UTC)
    session.commit()
    session.refresh(prefs)

    return _model_to_response(prefs)


@router.post("/reset")
def reset_preferences(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Reset all preferences to defaults (empty values for data-dependent fields)."""
    prefs = _get_or_create_preferences(session, current_user)

    # Reset to defaults - data-dependent fields start empty
    prefs.fiscal_year_start_month = 4
    prefs.essential_categories = json.dumps([])  # Empty - user configures after upload
    prefs.investment_account_mappings = json.dumps({})  # Empty - user configures after upload
    prefs.taxable_income_categories = json.dumps([])
    prefs.investment_returns_categories = json.dumps([])
    prefs.non_taxable_income_categories = json.dumps([])
    prefs.other_income_categories = json.dumps([])
    prefs.default_budget_alert_threshold = 80.0
    prefs.auto_create_budgets = False
    prefs.budget_rollover_enabled = False
    prefs.number_format = "indian"
    prefs.currency_symbol = "₹"
    prefs.currency_symbol_position = "before"
    prefs.default_time_range = "all_time"
    prefs.anomaly_expense_threshold = 2.0
    prefs.anomaly_types_enabled = json.dumps(
        ["high_expense", "unusual_category", "large_transfer", "budget_exceeded"],
    )
    prefs.auto_dismiss_recurring_anomalies = True
    prefs.recurring_min_confidence = 50.0
    prefs.recurring_auto_confirm_occurrences = 6
    prefs.needs_target_percent = 50.0
    prefs.wants_target_percent = 30.0
    prefs.savings_target_percent = 20.0
    prefs.credit_card_limits = json.dumps({})
    prefs.earning_start_date = None
    prefs.use_earning_start_date = False
    prefs.updated_at = datetime.now(UTC)

    session.commit()
    session.refresh(prefs)

    return _model_to_response(prefs)


# ----- Section-specific endpoints for granular updates -----


@router.put("/fiscal-year")
def update_fiscal_year(
    current_user: CurrentUser,
    config: FiscalYearConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update fiscal year configuration."""
    return _update_section(session, current_user, config)


@router.put("/essential-categories")
def update_essential_categories(
    current_user: CurrentUser,
    config: EssentialCategoriesConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update essential categories list."""
    return _update_section(session, current_user, config, json_fields={"essential_categories"})


@router.put("/investment-mappings")
def update_investment_mappings(
    current_user: CurrentUser,
    config: InvestmentMappingsConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update investment account mappings."""
    return _update_section(
        session, current_user, config, json_fields={"investment_account_mappings"}
    )


@router.put("/income-sources")
def update_income_sources(
    current_user: CurrentUser,
    config: IncomeSourcesConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update income source category mappings."""
    return _update_section(
        session,
        current_user,
        config,
        json_fields={
            "taxable_income_categories",
            "investment_returns_categories",
            "non_taxable_income_categories",
            "other_income_categories",
        },
    )


@router.put("/budget-defaults")
def update_budget_defaults(
    current_user: CurrentUser,
    config: BudgetDefaultsConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update budget default settings."""
    return _update_section(session, current_user, config)


@router.put("/display")
def update_display_preferences(
    current_user: CurrentUser,
    config: DisplayPreferencesConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update display and format preferences."""
    return _update_section(session, current_user, config)


@router.put("/anomaly-settings")
def update_anomaly_settings(
    current_user: CurrentUser,
    config: AnomalySettingsConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update anomaly detection settings."""
    return _update_section(
        session, current_user, config, json_fields={"anomaly_types_enabled"}
    )


@router.put("/recurring-settings")
def update_recurring_settings(
    current_user: CurrentUser,
    config: RecurringSettingsConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update recurring transaction detection settings."""
    return _update_section(session, current_user, config)


@router.put("/spending-rule")
def update_spending_rule(
    current_user: CurrentUser,
    config: SpendingRuleConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update spending rule target percentages."""
    return _update_section(session, current_user, config)


@router.put("/credit-card-limits")
def update_credit_card_limits(
    current_user: CurrentUser,
    config: CreditCardLimitsConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update credit card limit settings."""
    return _update_section(session, current_user, config, json_fields={"credit_card_limits"})


@router.put("/earning-start-date")
def update_earning_start_date(
    current_user: CurrentUser,
    config: EarningStartDateConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update earning start date configuration."""
    return _update_section(session, current_user, config)

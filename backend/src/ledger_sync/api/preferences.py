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

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.encryption import decrypt_api_key, encrypt_api_key
from ledger_sync.db.models import User, UserPreferences
from ledger_sync.schemas.salary import (
    GrowthAssumptionsConfig,
    RsuGrantsConfig,
    SalaryStructureConfig,
)

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


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
    credit_card_limits: dict[str, float] | None = None

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

    # Salary & Tax Projections
    salary_structure: dict[str, Any] | None = None
    rsu_grants: list[dict[str, Any]] | None = None
    growth_assumptions: dict[str, Any] | None = None


# ----- Helper Functions -----


def _parse_json_field(value: str | list[Any] | dict[str, Any], default: Any = None) -> Any:
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
        display_currency=prefs.display_currency,
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
        fixed_expense_categories=_parse_json_field(prefs.fixed_expense_categories),
        savings_goal_percent=prefs.savings_goal_percent,
        monthly_investment_target=prefs.monthly_investment_target,
        payday=prefs.payday,
        preferred_tax_regime=prefs.preferred_tax_regime,
        excluded_accounts=_parse_json_field(prefs.excluded_accounts),
        notify_budget_alerts=prefs.notify_budget_alerts,
        notify_anomalies=prefs.notify_anomalies,
        notify_upcoming_bills=prefs.notify_upcoming_bills,
        notify_days_ahead=prefs.notify_days_ahead,
        salary_structure=_parse_json_field(prefs.salary_structure, {}),
        rsu_grants=_parse_json_field(prefs.rsu_grants, []),
        growth_assumptions=_parse_json_field(prefs.growth_assumptions, {}),
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
    for field, value in config.model_dump(mode="json").items():
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
    prefs.display_currency = "INR"
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
    prefs.fixed_expense_categories = json.dumps([])
    prefs.savings_goal_percent = 20.0
    prefs.monthly_investment_target = 0.0
    prefs.payday = 1
    prefs.preferred_tax_regime = "new"
    prefs.excluded_accounts = json.dumps([])
    prefs.notify_budget_alerts = True
    prefs.notify_anomalies = True
    prefs.notify_upcoming_bills = True
    prefs.notify_days_ahead = 7
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
    return _update_section(session, current_user, config, json_fields={"anomaly_types_enabled"})


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


@router.put("/salary-structure")
def update_salary_structure(
    current_user: CurrentUser,
    config: SalaryStructureConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update salary structure for one or more fiscal years."""
    return _update_section(session, current_user, config, json_fields={"salary_structure"})


@router.put("/rsu-grants")
def update_rsu_grants(
    current_user: CurrentUser,
    config: RsuGrantsConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update RSU grants and vesting schedules."""
    return _update_section(session, current_user, config, json_fields={"rsu_grants"})


@router.put("/growth-assumptions")
def update_growth_assumptions(
    current_user: CurrentUser,
    config: GrowthAssumptionsConfig,
    session: DatabaseSession,
) -> UserPreferencesResponse:
    """Update growth assumptions for tax projections."""
    return _update_section(session, current_user, config, json_fields={"growth_assumptions"})


# ----- AI Assistant Configuration -----


class AIConfigUpdate(BaseModel):
    """AI assistant configuration."""

    provider: str = Field(pattern=r"^(openai|anthropic|bedrock)$", description="LLM provider")
    model: str = Field(min_length=1, max_length=100, description="Model ID")
    api_key: str = Field(min_length=1, description="Provider API key (will be encrypted)")
    region: str | None = Field(default=None, max_length=20, description="AWS region for Bedrock")


class AIConfigResponse(BaseModel):
    """AI config response (never includes raw key)."""

    provider: str | None = None
    model: str | None = None
    has_key: bool = False
    region: str | None = None


@router.put("/ai-config")
def update_ai_config(
    current_user: CurrentUser,
    config: AIConfigUpdate,
    session: DatabaseSession,
) -> AIConfigResponse:
    """Store AI provider configuration with encrypted API key."""
    prefs = _get_or_create_preferences(session, current_user)
    prefs.ai_provider = config.provider
    prefs.ai_model = config.model
    if config.region and config.provider == "bedrock":
        prefs.ai_model = f"{config.model}|{config.region}"
    prefs.ai_api_key_encrypted = encrypt_api_key(config.api_key)
    prefs.updated_at = datetime.now(UTC)
    session.commit()
    return AIConfigResponse(
        provider=prefs.ai_provider,
        model=config.model,
        has_key=True,
        region=config.region,
    )


@router.get("/ai-config")
def get_ai_config(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> AIConfigResponse:
    """Get AI config (without the raw key)."""
    prefs = _get_or_create_preferences(session, current_user)
    model = prefs.ai_model
    region = None
    if model and "|" in model:
        model, region = model.rsplit("|", 1)
    return AIConfigResponse(
        provider=prefs.ai_provider,
        model=model,
        has_key=prefs.ai_api_key_encrypted is not None,
        region=region,
    )


@router.get("/ai-config/key")
def get_ai_key(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, str]:
    """Decrypt and return the API key for frontend LLM calls."""
    prefs = _get_or_create_preferences(session, current_user)
    if not prefs.ai_api_key_encrypted:
        raise HTTPException(status_code=404, detail="No AI key configured")
    return {"api_key": decrypt_api_key(prefs.ai_api_key_encrypted)}


@router.delete("/ai-config")
def delete_ai_config(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, str]:
    """Remove AI configuration and encrypted key."""
    prefs = _get_or_create_preferences(session, current_user)
    prefs.ai_provider = None
    prefs.ai_model = None
    prefs.ai_api_key_encrypted = None
    prefs.updated_at = datetime.now(UTC)
    session.commit()
    return {"status": "deleted"}

"""User Preferences API endpoints (general + sub-section setters).

AI-config endpoints live in api/preferences_ai.py (also mounted on the
same router via include_router below).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.preferences_ai import router as ai_router
from ledger_sync.api.preferences_helpers import (
    AnomalySettingsConfig,
    BudgetDefaultsConfig,
    CreditCardLimitsConfig,
    DisplayPreferencesConfig,
    EarningStartDateConfig,
    EssentialCategoriesConfig,
    FiscalYearConfig,
    IncomeSourcesConfig,
    InvestmentMappingsConfig,
    RecurringSettingsConfig,
    SpendingRuleConfig,
    UserPreferencesResponse,
    UserPreferencesUpdate,
    _get_or_create_preferences,
    _model_to_response,
    _update_section,
)
from ledger_sync.schemas.salary import (
    GrowthAssumptionsConfig,
    RsuGrantsConfig,
    SalaryStructureConfig,
)

router = APIRouter(prefix="/api/preferences", tags=["preferences"])
router.include_router(ai_router)


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
    prefs.show_tds_schedule = False
    prefs.epf_withdrawal_taxable = False
    prefs.epf_taxable_percent = 100
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

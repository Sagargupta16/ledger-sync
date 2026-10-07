"""ORM helpers shared by preferences endpoints, plus their request/response models.

Endpoints live in api/preferences.py (general) and api/preferences_ai.py
(AI-config). Both import from this module. The Pydantic models are defined in
``preferences_schemas`` and re-exported here unchanged.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.api.preferences_schemas import (
    SPENDING_SPLIT_FIELDS,
    AnomalySettingsConfig,
    BudgetDefaultsConfig,
    CapitalLossConfig,
    CreditCardLimitsConfig,
    CreditLimit,
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
    spending_split_error,
)
from ledger_sync.core.analytics.refresh import lock_analytics_user, mark_preferences_changed
from ledger_sync.db.models import User, UserPreferences
from ledger_sync.services.account_settings import (
    get_credit_card_limits,
    replace_credit_card_limits,
)
from ledger_sync.services.compensation import (
    read_compensation,
    replace_rsu_grants,
    replace_salary_structure,
)

__all__ = [
    "AnomalySettingsConfig",
    "BudgetDefaultsConfig",
    "CapitalLossConfig",
    "CreditCardLimitsConfig",
    "CreditLimit",
    "DisplayPreferencesConfig",
    "EarningStartDateConfig",
    "EssentialCategoriesConfig",
    "FiscalYearConfig",
    "IncomeSourcesConfig",
    "InvestmentMappingsConfig",
    "RecurringSettingsConfig",
    "SpendingRuleConfig",
    "UserPreferencesResponse",
    "UserPreferencesUpdate",
]


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


def _model_to_response(prefs: UserPreferences, session: Session) -> UserPreferencesResponse:
    """Read a coherent response, including after a writer's commit released its lock."""
    lock_analytics_user(session, prefs.user_id, read_only=True)
    if not session.is_modified(prefs):
        session.refresh(prefs)
    compensation = read_compensation(session, prefs.user_id)
    return UserPreferencesResponse(
        id=prefs.id,
        fiscal_year_start_month=prefs.fiscal_year_start_month,
        essential_categories=_parse_json_field(prefs.essential_categories),
        investment_account_mappings=_parse_json_field(prefs.investment_account_mappings),
        taxable_income_categories=_parse_json_field(prefs.taxable_income_categories),
        investment_returns_categories=_parse_json_field(prefs.investment_returns_categories),
        non_taxable_income_categories=_parse_json_field(prefs.non_taxable_income_categories),
        other_income_categories=_parse_json_field(prefs.other_income_categories),
        capital_loss_categories=_parse_json_field(prefs.capital_loss_categories),
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
        credit_card_limits={
            label: float(amount)
            for label, amount in get_credit_card_limits(session, prefs.user_id).items()
        },
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
        show_tds_schedule=prefs.show_tds_schedule,
        epf_withdrawal_taxable=prefs.epf_withdrawal_taxable,
        epf_taxable_percent=prefs.epf_taxable_percent,
        salary_is_net_of_tds=prefs.salary_is_net_of_tds,
        salary_structure=compensation["salary_structure"],
        rsu_grants=compensation["rsu_grants"],
        growth_assumptions=_parse_json_field(prefs.growth_assumptions, {}),
        created_at=prefs.created_at,
        updated_at=prefs.updated_at,
    )


def _get_or_create_preferences(
    session: Session, user: User, *, commit: bool = True
) -> UserPreferences:
    """Get defaults under the user lock; mutation callers keep one transaction."""
    lock_analytics_user(session, user.id)
    result = session.execute(select(UserPreferences).where(UserPreferences.user_id == user.id))
    prefs = result.scalar_one_or_none()

    if prefs is None:
        # Create default preferences for this user
        prefs = UserPreferences(user_id=user.id)
        session.add(prefs)
        session.flush()
        if commit:
            session.commit()
            session.refresh(prefs)

    return prefs


def _reject_invalid_spending_split(prefs: UserPreferences, values: dict[str, Any]) -> None:
    """422 before any write when the merged needs/wants/savings split misses 100%.

    Checked only when the batch sets one of the three; omitted ones keep their
    stored values, so a partial update is judged by the split it would leave.
    """
    if not any(field in values for field in SPENDING_SPLIT_FIELDS):
        return
    error = spending_split_error(
        *(values.get(field, getattr(prefs, field)) for field in SPENDING_SPLIT_FIELDS)
    )
    if error:
        raise HTTPException(status_code=422, detail=error)


def _apply_preference_updates(
    session: Session, user: User, values: dict[str, Any]
) -> UserPreferences:
    """Persist one settings batch and its invalidation together, skipping no-op bumps."""
    prefs = _get_or_create_preferences(session, user, commit=False)
    session.refresh(prefs)
    _reject_invalid_spending_split(prefs, values)
    changed = False
    for field, value in values.items():
        if field in _DOMAIN_PREFERENCE_WRITERS:
            try:
                domain_changed = _DOMAIN_PREFERENCE_WRITERS[field](session, user.id, value)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            changed = domain_changed or changed
            continue
        previous = getattr(prefs, field)
        if isinstance(value, (list, dict)):
            if _parse_json_field(previous, default=None) == value:
                continue
            value = json.dumps(value)
        elif previous == value:
            continue
        setattr(prefs, field, value)
        changed = True
    if changed:
        mark_preferences_changed(session, user.id)
    prefs.updated_at = datetime.now(UTC)
    session.commit()
    session.refresh(prefs)
    return prefs


_DOMAIN_PREFERENCE_WRITERS: dict[str, Callable[[Session, int, Any], bool]] = {
    "credit_card_limits": replace_credit_card_limits,
    "salary_structure": replace_salary_structure,
    "rsu_grants": replace_rsu_grants,
}


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
    # json_fields remains accepted for existing section callers. Collection
    # values share the same JSON handling as the general preferences endpoint.
    prefs = _apply_preference_updates(session, user, config.model_dump(mode="json"))
    return _model_to_response(prefs, session)

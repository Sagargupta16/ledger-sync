"""Settings writes invalidate their user's published analytics atomically."""

from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import event, func, select

from ledger_sync.core.analytics.engine import AnalyticsEngine
from ledger_sync.core.analytics.refresh import analytics_is_current, get_analytics_state
from ledger_sync.db.models import (
    AnalyticsState,
    AuditLog,
    CohortSpending,
    DailySummary,
    LedgerAccount,
    Transaction,
    TransactionType,
    UserPreferences,
)
from ledger_sync.services.compensation import replace_rsu_grants


def _publish(session, user):
    AnalyticsEngine(session, user.id).refresh_analytics()
    return get_analytics_state(session, user.id)


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        ("", {"excluded_accounts": ["Hidden"]}),
        ("/fiscal-year", {"fiscal_year_start_month": 1}),
        ("/essential-categories", {"essential_categories": ["Food"]}),
        ("/investment-mappings", {"investment_account_mappings": {"Broker": "stocks"}}),
        (
            "/income-sources",
            {
                "taxable_income_categories": ["Job::Salary"],
                "investment_returns_categories": [],
                "non_taxable_income_categories": [],
                "other_income_categories": [],
            },
        ),
        ("/capital-loss-categories", {"capital_loss_categories": ["Trading::Loss"]}),
        (
            "/budget-defaults",
            {
                "default_budget_alert_threshold": 90,
                "auto_create_budgets": True,
                "budget_rollover_enabled": True,
            },
        ),
        (
            "/display",
            {
                "number_format": "international",
                "currency_symbol": "$",
                "currency_symbol_position": "before",
                "default_time_range": "all_time",
                "display_currency": "USD",
            },
        ),
        (
            "/anomaly-settings",
            {
                "anomaly_expense_threshold": 3,
                "anomaly_types_enabled": ["high_expense"],
                "auto_dismiss_recurring_anomalies": False,
            },
        ),
        (
            "/recurring-settings",
            {
                "recurring_min_confidence": 70,
                "recurring_auto_confirm_occurrences": 8,
            },
        ),
        (
            "/spending-rule",
            {
                "needs_target_percent": 40,
                "wants_target_percent": 30,
                "savings_target_percent": 30,
            },
        ),
        ("/credit-card-limits", {"credit_card_limits": {"Card": 12345}}),
        (
            "/earning-start-date",
            {"earning_start_date": "2024-04-01", "use_earning_start_date": True},
        ),
        (
            "/salary-structure",
            {"salary_structure": {"2026-27": {"base_salary_annual": 200000}}},
        ),
        ("/rsu-grants", {"rsu_grants": []}),
        ("/growth-assumptions", {"growth_assumptions": {}}),
    ],
)
def test_settings_sections_invalidate_only_actual_changes(two_user_client, path, payload):
    client, session, user, other, _ = two_user_client
    # Seed non-empty values for the two collection-clear requests.
    prefs = session.scalar(select(UserPreferences).where(UserPreferences.user_id == user.id))
    if path == "/rsu-grants":
        replace_rsu_grants(
            session,
            user.id,
            [
                {
                    "id": "old",
                    "stock_name": "Synthetic",
                    "stock_price": 100,
                    "vestings": [{"date": "2027-01-01", "quantity": 1}],
                }
            ],
        )
    if path == "/growth-assumptions":
        prefs.growth_assumptions = '{"salary_growth_pct": 12}'
    session.commit()
    _publish(session, user)
    _publish(session, other)
    response = client.put(f"/api/preferences{path}", json=payload)
    assert response.status_code == 200, response.text
    assert "id" in response.json()
    state = get_analytics_state(session, user.id)
    assert state.preferences_version == 1
    assert state.full_rebuild_required
    assert not analytics_is_current(state)
    assert analytics_is_current(get_analytics_state(session, other.id))

    assert client.put(f"/api/preferences{path}", json=payload).status_code == 200
    assert get_analytics_state(session, user.id).preferences_version == 1


def test_first_preferences_write_and_version_bump_have_one_commit(two_user_client):
    client, session, user, _, _ = two_user_client
    session.query(UserPreferences).filter(UserPreferences.user_id == user.id).delete()
    session.commit()
    commits = []

    def listener(_session):
        commits.append(True)

    event.listen(session, "after_commit", listener)
    try:
        result = client.put("/api/preferences", json={"fiscal_year_start_month": 1})
    finally:
        event.remove(session, "after_commit", listener)
    assert result.status_code == 200
    assert len(commits) == 1
    assert get_analytics_state(session, user.id).preferences_version == 1


def test_settings_failure_rolls_back_value_and_invalidation(two_user_client, monkeypatch):
    from ledger_sync.api import preferences_helpers

    client, session, user, _, _ = two_user_client
    _publish(session, user)
    original = preferences_helpers.mark_preferences_changed

    def fail(db, user_id):
        original(db, user_id)
        raise RuntimeError("synthetic settings failure")

    monkeypatch.setattr(preferences_helpers, "mark_preferences_changed", fail)
    with pytest.raises(RuntimeError, match="synthetic settings failure"):
        client.put("/api/preferences/fiscal-year", json={"fiscal_year_start_month": 1})
    # The shared test dependency does not own a transaction; production's
    # get_session performs this rollback on request failure.
    session.rollback()
    assert (
        session.scalar(
            select(UserPreferences.fiscal_year_start_month).where(
                UserPreferences.user_id == user.id
            )
        )
        == 4
    )
    assert analytics_is_current(get_analytics_state(session, user.id))


def test_reset_preferences_invalidates_once_and_ai_only_changes_do_not(two_user_client):
    client, session, user, _, _ = two_user_client
    _publish(session, user)
    assert client.put("/api/preferences", json={"excluded_accounts": ["Hidden"]}).status_code == 200
    _publish(session, user)
    assert client.post("/api/preferences/reset").status_code == 200
    state = get_analytics_state(session, user.id)
    assert state.preferences_version == 2
    assert not analytics_is_current(state)
    assert client.post("/api/preferences/reset").status_code == 200
    assert get_analytics_state(session, user.id).preferences_version == 2
    _publish(session, user)
    assert (
        client.patch(
            "/api/preferences/ai-config/limits", json={"daily_token_limit": 1234}
        ).status_code
        == 200
    )
    assert analytics_is_current(get_analytics_state(session, user.id))


def test_account_classification_lifecycle_invalidates_and_noops_do_not(two_user_client):
    client, session, user, other, _ = two_user_client
    _publish(session, user)
    _publish(session, other)
    params = {"account_name": "Bank", "account_type": "Bank Accounts"}
    assert client.post("/api/account-classifications", params=params).status_code == 200
    assert get_analytics_state(session, user.id).preferences_version == 1
    assert client.post("/api/account-classifications", params=params).status_code == 200
    assert get_analytics_state(session, user.id).preferences_version == 1
    _publish(session, user)
    close = {"account_name": "Bank", "is_closed": True}
    assert client.put("/api/account-classifications/status", json=close).status_code == 200
    assert get_analytics_state(session, user.id).preferences_version == 2
    closed_query = select(LedgerAccount.closed_date).where(
        LedgerAccount.user_id == user.id, LedgerAccount.key == "bank"
    )
    closed_at = session.scalar(closed_query)
    assert client.put("/api/account-classifications/status", json=close).status_code == 200
    assert session.scalar(closed_query) == closed_at
    assert get_analytics_state(session, user.id).preferences_version == 2
    assert (
        client.put(
            "/api/account-classifications/status", json={**close, "is_closed": False}
        ).status_code
        == 200
    )
    assert get_analytics_state(session, user.id).preferences_version == 3
    assert client.delete("/api/account-classifications/Bank").status_code == 200
    assert get_analytics_state(session, user.id).preferences_version == 4
    assert client.delete("/api/account-classifications/Bank").status_code == 200
    assert get_analytics_state(session, user.id).preferences_version == 4
    assert analytics_is_current(get_analytics_state(session, other.id))


def test_budget_creation_requires_refresh(two_user_client):
    client, session, user, _, _ = two_user_client
    _publish(session, user)
    result = client.post(
        "/api/analytics/v2/budgets", json={"category": "Food", "monthly_limit": 500}
    )
    assert result.status_code == 200
    assert result.json()["success"] is True
    assert get_analytics_state(session, user.id).preferences_version == 1
    assert not analytics_is_current(get_analytics_state(session, user.id))


def test_freshness_endpoint_and_refresh_preserve_existing_envelope(two_user_client):
    client, session, user, other, current = two_user_client
    original_updated_at = user.updated_at
    response = client.get("/api/analytics/v2/freshness")
    assert response.status_code == 200
    assert response.json()["status"] == "uninitialized"
    assert session.scalar(select(func.count()).select_from(AnalyticsState)) == 0
    session.refresh(user)
    assert user.updated_at == original_updated_at
    response = client.post("/api/analytics/v2/refresh")
    assert response.status_code == 200, response.text
    assert set(response.json()) == {"success", "analytics"}
    assert all(type(value) is int for value in response.json()["analytics"].values())
    assert client.get("/api/analytics/v2/freshness").json()["is_current"] is True
    assert client.post("/api/analytics/v2/refresh").json() == {"success": True, "analytics": {}}
    assert session.scalar(select(func.count()).select_from(AuditLog)) == 1
    assert client.post("/api/analytics/v2/refresh?force_full=true").status_code == 200
    assert session.scalar(select(func.count()).select_from(AuditLog)) == 2
    assert client.put("/api/preferences", json={"excluded_accounts": ["Hidden"]}).status_code == 200
    metadata = client.get("/api/analytics/v2/freshness").json()
    assert metadata["status"] == "stale"
    assert metadata["current"]["preferences_version"] == 1
    assert metadata["published"]["preferences_version"] == 0
    current["user"] = other
    assert client.get("/api/analytics/v2/freshness").json()["status"] == "uninitialized"


@pytest.mark.parametrize("mode", ["transactions", "full"])
def test_account_reset_clears_rollups_and_invalidates_published_version(two_user_client, mode):
    client, session, user, other, _ = two_user_client
    session.add(
        Transaction(
            user_id=user.id,
            transaction_id="reset-fixture",
            date=datetime.fromisoformat("2024-01-02"),
            amount=Decimal("10.01"),
            currency="INR",
            type=TransactionType.EXPENSE,
            account="Cash",
            category="Food",
            source_file="fixture.csv",
            is_deleted=False,
        )
    )
    session.commit()
    _publish(session, user)
    _publish(session, other)
    result = client.post(f"/api/auth/account/reset?mode={mode}")
    assert result.status_code == 200, result.text
    state = get_analytics_state(session, user.id)
    assert state.ledger_version == 1
    assert state.preferences_version == (1 if mode == "full" else 0)
    assert not analytics_is_current(state)
    for model in (DailySummary, CohortSpending):
        assert (
            session.scalar(select(func.count()).select_from(model).where(model.user_id == user.id))
            == 0
        )
    assert analytics_is_current(get_analytics_state(session, other.id))

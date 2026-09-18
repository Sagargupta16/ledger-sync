"""Cross-domain API compatibility and reset ownership contracts."""

from decimal import Decimal

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from ledger_sync.api.main import app
from ledger_sync.db import session as database_sessions
from ledger_sync.db.models import (
    AccountType,
    LedgerAccount,
    LedgerAccountAlias,
    RsuGrantRecord,
    RsuVestingRecord,
    SalaryPlan,
    User,
    UserAISettings,
    UserPreferences,
)
from ledger_sync.services.account_settings import set_account_type
from ledger_sync.services.auth_service import AuthService


def _payload():
    return {
        "credit_card_limits": {"Card": 12345.67},
        "salary_structure": {
            "2026-27": {"base_salary_annual": "9876543210.123456789", "hra_annual": None}
        },
        "rsu_grants": [
            {
                "id": "public-grant",
                "stock_name": "TEST",
                "stock_price": "123.456789",
                "vestings": [
                    {"date": "2026-09-18", "quantity": 3, "net_quantity": "1.25"},
                    {"date": "2026-09-18", "quantity": 3, "net_quantity": "1.25"},
                ],
            }
        ],
    }


def test_combined_preferences_round_trip_keeps_ids_and_ownership(two_user_client):
    client, session, owner, other, current = two_user_client
    response = client.put("/api/preferences", json=_payload())
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["credit_card_limits"] == {"Card": 12345.67}
    assert saved["salary_structure"]["2026-27"]["base_salary_annual"] == "9876543210.123456789"
    assert saved["salary_structure"]["2026-27"]["hra_annual"] is None
    event_ids = [row["id"] for row in saved["rsu_grants"][0]["vestings"]]
    assert len(set(event_ids)) == 2
    replay = {name: saved[name] for name in _payload()}
    assert client.put("/api/preferences", json=replay).status_code == 200
    assert client.get("/api/preferences").json()["rsu_grants"] == saved["rsu_grants"]
    assert session.scalar(select(func.count()).select_from(RsuVestingRecord)) == 2
    current["user"] = other
    other_prefs = client.get("/api/preferences").json()
    assert other_prefs["credit_card_limits"] == {}
    assert other_prefs["salary_structure"] == {}
    assert other_prefs["rsu_grants"] == []
    stolen = client.put("/api/preferences", json={"rsu_grants": saved["rsu_grants"]})
    assert stolen.status_code == 422
    session.rollback()
    current["user"] = owner
    assert client.get("/api/preferences").json()["rsu_grants"] == saved["rsu_grants"]


def test_ordinary_preferences_do_not_read_ai_credentials(two_user_client):
    client, session, owner, _other, _current = two_user_client
    session.add(UserAISettings(user_id=owner.id, ai_api_key_encrypted="synthetic-ciphertext"))
    session.commit()
    statements = []

    def capture(_connection, _cursor, statement, _parameters, _context, _many):
        statements.append(statement.lower())

    event.listen(session.bind, "before_cursor_execute", capture)
    try:
        response = client.get("/api/preferences")
    finally:
        event.remove(session.bind, "before_cursor_execute", capture)
    assert response.status_code == 200
    assert "synthetic-ciphertext" not in response.text
    assert all("user_ai_settings" not in statement for statement in statements)
    assert all("ai_api_key_encrypted" not in statement for statement in statements)


@pytest.mark.parametrize("mode", ["transactions", "full", "delete"])
def test_reset_preserves_or_removes_new_domains_for_only_its_owner(two_user_client, mode):
    client, session, owner, other, current = two_user_client
    for user in (owner, other):
        current["user"] = user
        assert client.put("/api/preferences", json=_payload()).status_code == 200
        set_account_type(session, user.id, "Card", AccountType.CREDIT_CARDS)
        session.add(UserAISettings(user_id=user.id, ai_api_key_encrypted="synthetic-ciphertext"))
    session.commit()
    owner_id, other_id = owner.id, other.id
    service = AuthService(session)
    if mode == "delete":
        service.delete_account(owner)
    else:
        service.reset_account(owner, transactions_only=mode == "transactions")
    session.expire_all()
    for model in (LedgerAccount, LedgerAccountAlias, SalaryPlan, RsuGrantRecord, RsuVestingRecord):
        assert (
            session.scalar(select(func.count()).select_from(model).where(model.user_id == other_id))
            > 0
        )
        owner_count = session.scalar(
            select(func.count()).select_from(model).where(model.user_id == owner_id)
        )
        assert (owner_count > 0) == (mode == "transactions")
    assert session.get(UserAISettings, other_id).ai_api_key_encrypted == "synthetic-ciphertext"
    ai = session.get(UserAISettings, owner_id)
    if mode == "transactions":
        assert ai.ai_api_key_encrypted == "synthetic-ciphertext"
        account = session.scalar(select(LedgerAccount).where(LedgerAccount.user_id == owner_id))
        assert account.credit_limit == Decimal("12345.67")
    elif mode == "full":
        assert ai.ai_api_key_encrypted is None
        assert ai.ai_mode == "app_bedrock"
    else:
        assert ai is None
        assert session.get(User, owner_id) is None


def test_registration_initializes_both_settings_domains(test_db_session):
    session = test_db_session
    AuthService(session).oauth_login_or_register(
        email="new-domain-owner@example.test",
        full_name="Test",
        provider="google",
        provider_id="synthetic-domain-subject",
    )
    user = session.scalar(select(User))
    assert session.scalar(select(UserPreferences).where(UserPreferences.user_id == user.id))
    assert session.get(UserAISettings, user.id).ai_mode == "app_bedrock"


@pytest.mark.parametrize("path", ["", "/credit-card-limits"])
@pytest.mark.parametrize("invalid", [True, "1.001", "NaN", "-1", "10000000000000"])
def test_credit_limits_validate_before_lossy_request_coercion(two_user_client, path, invalid):
    client, session, owner, _other, _current = two_user_client
    response = client.put(f"/api/preferences{path}", json={"credit_card_limits": {"Card": invalid}})
    assert response.status_code == 422, response.text
    assert (
        session.scalar(
            select(func.count()).select_from(LedgerAccount).where(LedgerAccount.user_id == owner.id)
        )
        == 0
    )


def test_invalid_combined_update_rolls_back_all_domains(two_user_client, monkeypatch):
    client, session, owner, _other, _current = two_user_client
    payload = _payload()
    payload["currency_symbol"] = "$"
    payload["rsu_grants"][0]["vestings"][0]["id"] = "unknown-event"
    # Exercise the real request dependency's rollback using a fresh session
    # against the disposable fixture engine.
    override = app.dependency_overrides.pop(database_sessions.get_session)
    monkeypatch.setattr(database_sessions, "SessionLocal", lambda: Session(session.bind))
    try:
        response = client.put("/api/preferences", json=payload)
    finally:
        app.dependency_overrides[database_sessions.get_session] = override
    assert response.status_code == 422, response.text
    session.expire_all()
    for model in (LedgerAccount, SalaryPlan, RsuGrantRecord, RsuVestingRecord):
        assert (
            session.scalar(select(func.count()).select_from(model).where(model.user_id == owner.id))
            == 0
        )
    prefs = session.scalar(select(UserPreferences).where(UserPreferences.user_id == owner.id))
    assert prefs.currency_symbol != "$"

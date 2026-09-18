"""Real migration chain retains legacy data until all copied values agree."""

import json
from decimal import Decimal

import pytest
import sqlalchemy as sa
from alembic import command
from sqlalchemy.orm import Session

from ledger_sync.db.models import LedgerAccount, UserAISettings
from ledger_sync.services.compensation import read_compensation
from tests.integration import test_migrations_from_scratch as migration_cases
from tests.integration.test_migrations_from_scratch import (
    _config,
    _insert_user,
)

migration_connection = migration_cases.migration_connection


def _seed_source(connection):
    command.upgrade(_config(connection), "live_index_predicates_2026")
    user_id = _insert_user(connection, "cutover@example.test")
    metadata = sa.MetaData()
    prefs = sa.Table("user_preferences", metadata, autoload_with=connection)
    connection.execute(
        prefs.insert().values(
            user_id=user_id,
            credit_card_limits='{"Card": 12345.67}',
            salary_structure='{"2026-27": {"base_salary_annual": "9876543210.123456789"}}',
            rsu_grants=json.dumps(
                [
                    {
                        "id": "public-grant",
                        "stock_name": "TEST",
                        "stock_price": "123.456789123",
                        "vestings": [
                            {"date": "2026-09-18", "quantity": 3, "net_quantity": "1.25"},
                            {"date": "2026-09-18", "quantity": 3, "net_quantity": "1.25"},
                        ],
                    }
                ]
            ),
            ai_mode="user_key",
            ai_api_key_encrypted="opaque-synthetic-ciphertext",
            ai_provider="openai",
            ai_model="synthetic-model",
        )
    )
    connection.commit()
    return user_id


def test_complete_cutover_preserves_exact_values_and_duplicate_events(migration_connection):
    connection = migration_connection
    user_id = _seed_source(connection)
    command.upgrade(_config(connection), "head")
    connection.commit()
    inspector = sa.inspect(connection)
    assert "account_classifications" not in inspector.get_table_names()
    assert not {"salary_structure", "rsu_grants", "credit_card_limits", "ai_api_key_encrypted"} & {
        column["name"] for column in inspector.get_columns("user_preferences")
    }
    with Session(connection) as session:
        ai = session.get(UserAISettings, user_id)
        assert ai.ai_api_key_encrypted == "opaque-synthetic-ciphertext"
        assert ai.ai_provider == "openai"
        account = session.scalar(sa.select(LedgerAccount).where(LedgerAccount.user_id == user_id))
        assert account.credit_limit == Decimal("12345.67")
        saved = read_compensation(session, user_id)
        assert saved["salary_structure"]["2026-27"]["base_salary_annual"] == (
            "9876543210.123456789"
        )
        events = saved["rsu_grants"][0]["vestings"]
        assert len(events) == 2
        assert events[0]["id"] != events[1]["id"]
        assert all(event["net_quantity"] == "1.25" for event in events)


@pytest.mark.parametrize(
    "tamper",
    [
        "UPDATE user_ai_settings SET ai_api_key_encrypted='changed'",
        "UPDATE ledger_accounts SET credit_limit=1",
        "UPDATE salary_plans SET base_salary_annual='1'",
        "DELETE FROM rsu_vestings",
        "UPDATE rsu_grants SET stock_name='Changed'",
    ],
)
def test_cutover_refuses_to_drop_source_when_backfill_disagrees(migration_connection, tamper):
    connection = migration_connection
    _seed_source(connection)
    command.upgrade(_config(connection), "compensation_records_2026")
    connection.exec_driver_sql(tamper)
    connection.commit()
    with pytest.raises(RuntimeError):
        command.upgrade(_config(connection), "head")
    connection.rollback()
    inspector = sa.inspect(connection)
    assert "account_classifications" in inspector.get_table_names()
    columns = {column["name"] for column in inspector.get_columns("user_preferences")}
    assert {
        "salary_structure",
        "rsu_grants",
        "credit_card_limits",
        "ai_api_key_encrypted",
    } <= columns
    assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == (
        "compensation_records_2026"
    )

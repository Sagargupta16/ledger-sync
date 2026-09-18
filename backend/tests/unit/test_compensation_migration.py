"""Frozen migration preflight, lossless backfill and normalized-only operation."""

from __future__ import annotations

import importlib
import json
import os
from decimal import Decimal
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema, DropSchema

from ledger_sync.db._models.compensation import RsuGrantRecord, RsuVestingRecord, SalaryPlan
from ledger_sync.services.compensation import (
    read_compensation,
    replace_rsu_grants,
    replace_salary_structure,
)

migration = importlib.import_module(
    "ledger_sync.db.migrations.versions.20260918_1200_compensation_records"
)


@pytest.fixture(params=["sqlite", "postgresql"])
def legacy_db(request, monkeypatch):
    if request.param == "postgresql":
        url = os.environ.get("LEDGER_SYNC_TEST_POSTGRES_URL")
        if not url:
            pytest.skip("Set LEDGER_SYNC_TEST_POSTGRES_URL to run local PostgreSQL migrations.")
        parsed = make_url(url)
        if (
            parsed.get_backend_name() != "postgresql"
            or parsed.host not in {"localhost", "127.0.0.1", "::1"}
            or not (parsed.database or "").startswith("ledger_sync_test")
        ):
            pytest.fail("Compensation migrations require a local ledger_sync_test* database.")
        engine = sa.create_engine(parsed.set(drivername="postgresql+psycopg"))
        schema = "test_compensation_migration_" + uuid4().hex
        with engine.begin() as connection:
            connection.execute(CreateSchema(schema))
        connection = engine.connect()
        # The name is generated locally, never taken from an input payload.
        connection.exec_driver_sql(f'SET search_path TO "{schema}"')
        connection.commit()
    else:
        engine = sa.create_engine("sqlite:///:memory:")
        connection = engine.connect()
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.commit()
    metadata = sa.MetaData()
    users = sa.Table("users", metadata, sa.Column("id", sa.Integer(), primary_key=True))
    preferences = sa.Table(
        "user_preferences",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("salary_structure", sa.Text()),
        sa.Column("rsu_grants", sa.Text()),
    )
    metadata.create_all(connection)
    connection.execute(users.insert(), [{"id": 1}, {"id": 2}])
    connection.commit()
    monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
    try:
        yield connection, preferences
    finally:
        connection.close()
        if request.param == "postgresql":
            with engine.begin() as cleanup:
                cleanup.execute(DropSchema(schema, cascade=True))
        engine.dispose()


def source_grant():
    return {
        "id": "same-public-id",
        "stock_name": "TEST",
        "stock_price": "123456789012345678901.1234567890123456789",
        "notes": None,
        "grant_date": "2025-02-15",
        "vestings": [
            {
                "date": "2026-08-15",
                "quantity": 25,
                "price_at_vest": "0.1234567890123456789123456789",
                "net_quantity": "17.200123456789123456789",
            },
            {
                "date": "2026-08-15",
                "quantity": 25,
                "price_at_vest": "0.1234567890123456789123456789",
                "net_quantity": "17.200123456789123456789",
            },
            {"date": "2025-08-15", "quantity": 25, "net_quantity": "0"},
            {"date": "2025-08-15", "quantity": 25},
        ],
    }


def seed(connection, preferences, *, salary="{}", grants="[]", user_id=1, row_id=1):
    connection.execute(
        preferences.insert().values(
            id=row_id,
            user_id=user_id,
            salary_structure=salary,
            rsu_grants=grants,
        )
    )
    connection.commit()


def test_backfill_preserves_every_event_decimal_and_null_and_retains_source(legacy_db):
    connection, preferences = legacy_db
    salary_json = (
        '{"2025-26":{"base_salary_annual":1234567890123456789.1234567890123456789,'
        '"hra_annual":null},"2026-27":{"hra_annual":0,"nps_monthly":"1E-400"}}'
    )
    grants_json = json.dumps([source_grant()])
    seed(connection, preferences, salary=salary_json, grants=grants_json)
    seed(connection, preferences, grants=grants_json, user_id=2, row_id=2)
    migration.upgrade()
    connection.commit()
    with Session(connection) as session:
        result = read_compensation(session, 1)
        salary = result["salary_structure"]
        assert Decimal(salary["2025-26"]["base_salary_annual"]) == Decimal(
            "1234567890123456789.1234567890123456789"
        )
        assert salary["2025-26"]["hra_annual"] is None
        assert Decimal(salary["2026-27"]["hra_annual"]) == 0
        assert Decimal(salary["2026-27"]["nps_monthly"]) == Decimal("1E-400")
        actual_grant = result["rsu_grants"][0]
        expected = source_grant()
        assert actual_grant["id"] == expected["id"]
        assert actual_grant["stock_price"] == expected["stock_price"]
        events = actual_grant["vestings"]
        assert len(events) == 4
        assert len({row["id"] for row in events}) == 4
        assert events[0]["net_quantity"] == expected["vestings"][0]["net_quantity"]
        assert events[0]["price_at_vest"] == expected["vestings"][0]["price_at_vest"]
        assert [row["date"] for row in events] == [row["date"] for row in expected["vestings"]]
        assert Decimal(events[2]["net_quantity"]) == 0
        assert events[3]["net_quantity"] is None
        assert events[3]["price_at_vest"] is None
        assert read_compensation(session, 2)["rsu_grants"][0]["id"] == expected["id"]
        assert not replace_rsu_grants(session, 1, result["rsu_grants"])
        assert not replace_salary_structure(session, 1, result["salary_structure"])
    original = connection.execute(sa.select(preferences).where(preferences.c.id == 1)).one()
    assert original.salary_structure == salary_json
    assert original.rsu_grants == grants_json


def test_services_continue_after_legacy_columns_are_removed(legacy_db):
    connection, preferences = legacy_db
    seed(connection, preferences, salary='{"2025-26":{}}', grants=json.dumps([source_grant()]))
    migration.upgrade()
    # This intentionally simulates the parent-owned final cutover migration.
    connection.exec_driver_sql("ALTER TABLE user_preferences DROP COLUMN salary_structure")
    connection.exec_driver_sql("ALTER TABLE user_preferences DROP COLUMN rsu_grants")
    connection.commit()
    with Session(connection) as session:
        saved = read_compensation(session, 1)
        saved["rsu_grants"][0]["vestings"][1]["net_quantity"] = "0.123456789123456789"
        assert replace_rsu_grants(session, 1, saved["rsu_grants"])
        assert replace_salary_structure(session, 1, {"2025-26": {"base_salary_annual": "42"}})
        assert read_compensation(session, 1)["rsu_grants"][0]["vestings"][1]["net_quantity"] == (
            "0.123456789123456789"
        )


@pytest.mark.parametrize(
    "salary,grants",
    [
        ('{"2025-26":{"mystery":10}}', "[]"),
        ('{"2025-26":{"hra_annual":null,"hra_annual":0}}', "[]"),
        ('{"2025-26":{},"2025-26":{}}', "[]"),
        ('{"2025-27":{}}', "[]"),
        ('{"2025-26":{"base_salary_annual":"NaN"}}', "[]"),
        ('{"2025-26":{"base_salary_annual":NaN}}', "[]"),
        ('{"2025-26":{"base_salary_annual":true}}', "[]"),
        ('{"2025-26":{"base_salary_annual":null}}', "[]"),
        ('{"2025-26":{"base_salary_annual":"1E-16384"}}', "[]"),
        ("null", "[]"),
        ("{}", "null"),
        ("{}", "{}"),
        ("{}", json.dumps([source_grant(), source_grant()])),
        ("{}", json.dumps([{**source_grant(), "unknown": "must-not-drop"}])),
        ("{}", json.dumps([{**source_grant(), "vestings": []}])),
        ("{}", json.dumps([{**source_grant(), "stock_price": 0}])),
        ("{}", json.dumps([{**source_grant(), "notes": 17}])),
        ("{}", json.dumps([{**source_grant(), "grant_date": "2025-02-30"}])),
        (
            "{}",
            json.dumps(
                [{**source_grant(), "vestings": [{"date": "2025-01-01", "quantity": True}]}]
            ),
        ),
        (
            "{}",
            json.dumps(
                [{**source_grant(), "vestings": [{"date": "2025-01-01", "quantity": "1.1"}]}]
            ),
        ),
        (
            "{}",
            json.dumps(
                [{**source_grant(), "vestings": [{"date": "2025-01-01", "quantity": 2147483648}]}]
            ),
        ),
        (
            "{}",
            json.dumps(
                [
                    {
                        **source_grant(),
                        "vestings": [
                            {
                                "date": "2025-01-01",
                                "quantity": 1,
                                "net_quantity": "1.000000000000000001",
                            }
                        ],
                    }
                ]
            ),
        ),
        (
            "{}",
            json.dumps(
                [
                    {
                        **source_grant(),
                        "vestings": [{"date": "2025-01-01", "quantity": 1, "price_at_vest": 0}],
                    }
                ]
            ),
        ),
        (
            "{}",
            json.dumps(
                [
                    {
                        **source_grant(),
                        "vestings": [{"date": "2025-01-01", "quantity": 1, "currency": "USD"}],
                    }
                ]
            ),
        ),
    ],
)
def test_invalid_source_fails_before_ddl_or_any_copy(legacy_db, salary, grants):
    connection, preferences = legacy_db
    seed(connection, preferences, salary='{"2025-26":{}}', grants=json.dumps([source_grant()]))
    seed(connection, preferences, salary=salary, grants=grants, user_id=2, row_id=2)
    before = connection.execute(sa.select(preferences).order_by(preferences.c.id)).all()
    tables = sa.inspect(connection).get_table_names()
    with pytest.raises(RuntimeError, match="preference ID 2"):
        migration.upgrade()
    assert sa.inspect(connection).get_table_names() == tables
    assert connection.execute(sa.select(preferences).order_by(preferences.c.id)).all() == before


@pytest.mark.parametrize("other_owner", [1, 99])
def test_ambiguous_or_orphan_owner_fails_before_ddl(legacy_db, other_owner):
    connection, preferences = legacy_db
    seed(connection, preferences)
    seed(connection, preferences, user_id=other_owner, row_id=2)
    with pytest.raises(RuntimeError, match="Missing or ambiguous preference owner"):
        migration.upgrade()
    assert "salary_plans" not in sa.inspect(connection).get_table_names()


def test_bootstrap_ownerless_exact_empty_defaults_are_preserved_without_inferred_owner(legacy_db):
    connection, preferences = legacy_db
    seed(connection, preferences, user_id=None)
    seed(connection, preferences, salary='{"2025-26":{}}', user_id=1, row_id=2)
    salary, grants, vestings = migration._preflight(connection)
    assert len(salary) == 1 and salary[0]["user_id"] == 1
    assert grants == [] and vestings == []
    migration.upgrade()
    assert connection.execute(
        sa.select(
            preferences.c.user_id, preferences.c.salary_structure, preferences.c.rsu_grants
        ).where(preferences.c.id == 1)
    ).one() == (None, "{}", "[]")
    assert connection.execute(sa.select(SalaryPlan.user_id)).scalars().all() == [1]


@pytest.mark.parametrize(
    "salary,grants",
    [
        ('{"2025-26":{}}', "[]"),
        ("{}", json.dumps([source_grant()])),
        (None, "[]"),
        ("null", "[]"),
        ("{}", None),
        ("{}", "null"),
        (" { }", "[]"),
    ],
)
def test_ownerless_compensation_other_than_exact_defaults_is_rejected(legacy_db, salary, grants):
    connection, preferences = legacy_db
    seed(connection, preferences, salary=salary, grants=grants, user_id=None)
    with pytest.raises(RuntimeError, match="Missing or ambiguous preference owner"):
        migration.upgrade()
    assert "salary_plans" not in sa.inspect(connection).get_table_names()


def test_empty_source_and_model_migration_table_parity(legacy_db):
    connection, preferences = legacy_db
    seed(connection, preferences)
    migration.upgrade()
    inspector = sa.inspect(connection)
    for model in (SalaryPlan, RsuGrantRecord, RsuVestingRecord):
        columns = inspector.get_columns(model.__tablename__)
        assert {column["name"] for column in columns} == set(model.__table__.columns.keys())
        assert {column["name"]: column["nullable"] for column in columns} == {
            column.name: column.nullable for column in model.__table__.columns
        }
    fks = inspector.get_foreign_keys("rsu_vestings")
    owner_fk = next(fk for fk in fks if fk["name"] == "fk_rsu_vestings_owner_grant")
    assert owner_fk["constrained_columns"] == ["user_id", "grant_id"]
    assert owner_fk["referred_columns"] == ["user_id", "id"]
    assert owner_fk["options"]["ondelete"] == "CASCADE"
    assert migration.revision == "compensation_records_2026"
    assert migration.down_revision == "ai_settings_2026"


def test_duplicate_explicit_event_ids_are_ambiguous_even_across_users(legacy_db):
    connection, preferences = legacy_db
    explicit = source_grant()
    explicit["vestings"] = [{"id": "existing-event", "date": "2025-01-01", "quantity": 1}]
    seed(connection, preferences, grants=json.dumps([explicit]))
    seed(connection, preferences, grants=json.dumps([explicit]), row_id=2, user_id=2)
    with pytest.raises(RuntimeError, match="Duplicate vesting ID"):
        migration.upgrade()
    assert "rsu_vestings" not in sa.inspect(connection).get_table_names()

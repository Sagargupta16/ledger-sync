"""Normalized compensation precision, ownership, identity and bounded queries."""

from __future__ import annotations

import copy
import json
import os
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, delete, event, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema, DropSchema

from ledger_sync.db._models.compensation import RsuGrantRecord, RsuVestingRecord, SalaryPlan
from ledger_sync.db._models.user import User
from ledger_sync.db.base import Base
from ledger_sync.services.compensation import (
    get_compensation_preferences_bulk,
    read_compensation,
    replace_rsu_grants,
    replace_salary_structure,
    update_compensation_preferences,
)


@pytest.fixture(params=["sqlite", "postgresql"])
def compensation_session(request):
    """Optional PostgreSQL run uses only a new schema on an explicit local test DB.

    Set LEDGER_SYNC_TEST_POSTGRES_URL to a local ledger_sync_test* database URL.
    No application settings, .env file or existing application schema is used.
    """
    if request.param == "postgresql":
        url = os.environ.get("LEDGER_SYNC_TEST_POSTGRES_URL")
        if not url:
            pytest.skip("Set LEDGER_SYNC_TEST_POSTGRES_URL to run local PostgreSQL tests.")
        parsed = make_url(url)
        if (
            parsed.get_backend_name() != "postgresql"
            or parsed.host not in {"localhost", "127.0.0.1", "::1"}
            or not (parsed.database or "").startswith("ledger_sync_test")
        ):
            pytest.fail("Compensation tests require a local ledger_sync_test* database.")
        engine = create_engine(parsed.set(drivername="postgresql+psycopg"))
        schema = "test_compensation_" + uuid4().hex
        with engine.begin() as connection:
            connection.execute(CreateSchema(schema))
        connection = engine.connect().execution_options(schema_translate_map={None: schema})
    else:
        engine = create_engine("sqlite:///:memory:")
        connection = engine.connect()
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.commit()
    try:
        # Only compensation tables and their owner, even when other agents add models.
        Base.metadata.create_all(
            connection,
            tables=[
                User.__table__,
                SalaryPlan.__table__,
                RsuGrantRecord.__table__,
                RsuVestingRecord.__table__,
            ],
        )
        connection.commit()
        with Session(connection) as session:
            session.add_all(
                [User(id=1, email="comp-a@example.test"), User(id=2, email="comp-b@example.test")]
            )
            session.commit()
            yield session
    finally:
        connection.close()
        if request.param == "postgresql":
            with engine.begin() as cleanup:
                cleanup.execute(DropSchema(schema, cascade=True))
        engine.dispose()


def grant(public_id="grant-1", *, vestings=None):
    return {
        "id": public_id,
        "stock_name": "TEST",
        "stock_price": "1234567890123456789.123456789123456789",
        "grant_date": None,
        "notes": "",
        "vestings": vestings
        if vestings is not None
        else [
            {
                "date": "2025-08-15",
                "quantity": 25,
                "price_at_vest": "21500.750000000123456789",
                "net_quantity": "17.200123456789123456789",
            },
        ],
    }


def event_ids(session, user_id=1):
    return [
        row.id
        for row in session.scalars(
            select(RsuVestingRecord)
            .where(RsuVestingRecord.user_id == user_id)
            .order_by(RsuVestingRecord.position, RsuVestingRecord.id)
        )
    ]


def test_exact_round_trip_and_independent_optional_values(compensation_session):
    session = compensation_session
    unknown = {"date": "2026-03-15", "quantity": 6}
    zero = {**unknown, "net_quantity": "0", "price_at_vest": "0.000000000000000000001"}
    actual = grant()["vestings"][0]
    payload = {
        "salary_structure": {
            "2025-26": {"base_salary_annual": "98765432109876543210.123456789123456789"},
            "2026-27": {"hra_annual": "0", "nps_monthly": "1E-400"},
        },
        "rsu_grants": [grant(vestings=[unknown, zero, actual])],
    }
    assert update_compensation_preferences(session, 1, payload)
    session.commit()
    session.expire_all()
    saved = read_compensation(session, 1)
    assert json.loads(json.dumps(saved)) == saved
    assert saved["salary_structure"]["2025-26"]["base_salary_annual"] == (
        "98765432109876543210.123456789123456789"
    )
    assert saved["salary_structure"]["2025-26"]["hra_annual"] is None
    assert Decimal(saved["salary_structure"]["2026-27"]["hra_annual"]) == 0
    assert Decimal(saved["salary_structure"]["2026-27"]["nps_monthly"]) == Decimal("1E-400")
    received = saved["rsu_grants"][0]
    assert Decimal(received["stock_price"]) == Decimal(payload["rsu_grants"][0]["stock_price"])
    assert received["notes"] == ""
    assert received["grant_date"] is None
    assert received["vestings"][0]["net_quantity"] is None
    assert received["vestings"][0]["price_at_vest"] is None
    assert Decimal(received["vestings"][1]["net_quantity"]) == 0
    assert received["vestings"][2]["net_quantity"] == actual["net_quantity"]
    assert received["vestings"][2]["price_at_vest"] == actual["price_at_vest"]
    assert [v["date"] for v in received["vestings"]] == [v["date"] for v in [unknown, zero, actual]]
    assert read_compensation(session, 2) == {"salary_structure": {}, "rsu_grants": []}


def test_noop_replacement_preserves_all_ids_and_does_not_write_or_commit(compensation_session):
    session = compensation_session
    update_compensation_preferences(
        session,
        1,
        {
            "salary_structure": {"2025-26": {"base_salary_annual": "1000.123456"}},
            "rsu_grants": [grant(), grant("another")],
        },
    )
    session.commit()
    ids = event_ids(session)
    salary_id = session.scalar(select(SalaryPlan.id))
    grant_ids = session.scalars(select(RsuGrantRecord.id)).all()
    statements = []

    def record_sql(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(session.bind, "before_cursor_execute", record_sql)
    try:
        assert not update_compensation_preferences(session, 1, read_compensation(session, 1))
    finally:
        event.remove(session.bind, "before_cursor_execute", record_sql)
    assert not any(
        sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) for sql in statements
    )
    assert event_ids(session) == ids
    assert session.scalar(select(SalaryPlan.id)) == salary_id
    assert session.scalars(select(RsuGrantRecord.id)).all() == grant_ids
    assert session.in_transaction()  # Writer did not commit its caller's transaction.


def test_salary_diff_updates_existing_fy_and_preserves_other_users(compensation_session):
    session = compensation_session
    original = {"2025-26": {"base_salary_annual": "100"}, "2026-27": {"hra_annual": "2"}}
    replace_salary_structure(session, 1, original)
    replace_salary_structure(session, 2, original)
    session.commit()
    first_id = session.scalar(
        select(SalaryPlan.id).where(SalaryPlan.user_id == 1, SalaryPlan.fiscal_year == "2025-26")
    )
    assert replace_salary_structure(
        session,
        1,
        {
            "2025-26": {"base_salary_annual": "100.000001"},
            "2027-28": {},
        },
    )
    assert (
        session.scalar(
            select(SalaryPlan.id).where(
                SalaryPlan.user_id == 1, SalaryPlan.fiscal_year == "2025-26"
            )
        )
        == first_id
    )
    assert list(read_compensation(session, 1)["salary_structure"]) == ["2025-26", "2027-28"]
    assert list(read_compensation(session, 2)["salary_structure"]) == ["2025-26", "2026-27"]
    session.rollback()
    assert list(read_compensation(session, 1)["salary_structure"]) == ["2025-26", "2026-27"]


def test_legacy_duplicates_match_by_occurrence_and_remove_only_excess(compensation_session):
    session = compensation_session
    same = grant()["vestings"][0]
    other = {**same, "net_quantity": "0"}
    replace_rsu_grants(session, 1, [grant(vestings=[same, same, other])])
    original_ids = event_ids(session)
    assert len(set(original_ids)) == 3
    assert not replace_rsu_grants(session, 1, [grant(vestings=[same, same, other])])
    assert event_ids(session) == original_ids
    assert replace_rsu_grants(session, 1, [grant(vestings=[other, same])])
    assert event_ids(session) == [original_ids[2], original_ids[0]]
    assert len(read_compensation(session, 1)["rsu_grants"][0]["vestings"]) == 2


def test_ids_target_edit_and_deletion_of_specific_identical_event(compensation_session):
    session = compensation_session
    same = grant()["vestings"][0]
    replace_rsu_grants(session, 1, [grant(vestings=[same, same, same])])
    saved = read_compensation(session, 1)["rsu_grants"]
    original_ids = [v["id"] for v in saved[0]["vestings"]]
    saved[0]["vestings"][1]["net_quantity"] = "0"
    saved[0]["vestings"] = [saved[0]["vestings"][2], saved[0]["vestings"][1]]
    assert replace_rsu_grants(session, 1, saved)
    assert event_ids(session) == [original_ids[2], original_ids[1]]
    saved = read_compensation(session, 1)["rsu_grants"]
    assert Decimal(saved[0]["vestings"][1]["net_quantity"]) == 0


def test_grant_order_public_identity_and_owner_isolation(compensation_session):
    session = compensation_session
    replace_rsu_grants(session, 1, [grant("a"), grant("b")])
    replace_rsu_grants(session, 2, [grant("a")])
    original = {
        row.public_id: row.id
        for row in session.scalars(select(RsuGrantRecord).where(RsuGrantRecord.user_id == 1))
    }
    other_ids = event_ids(session, 2)
    saved = read_compensation(session, 1)["rsu_grants"]
    saved.reverse()
    saved[0]["stock_price"] = "0.123456789123456789"
    replace_rsu_grants(session, 1, saved)
    assert [row["id"] for row in read_compensation(session, 1)["rsu_grants"]] == ["b", "a"]
    assert {
        row.public_id: row.id
        for row in session.scalars(select(RsuGrantRecord).where(RsuGrantRecord.user_id == 1))
    } == original
    assert replace_rsu_grants(session, 1, [])
    assert event_ids(session) == []
    assert event_ids(session, 2) == other_ids


@pytest.mark.parametrize(
    "case",
    [
        "duplicate_grant",
        "duplicate_event",
        "cross_owner",
        "cross_grant",
        "unknown_event",
        "unknown_field",
        "bad_net",
    ],
)
def test_invalid_updates_are_422_and_apply_neither_section(compensation_session, case):
    session = compensation_session
    replace_rsu_grants(session, 1, [grant("a"), grant("b")])
    replace_rsu_grants(session, 2, [grant("a")])
    session.commit()
    before = read_compensation(session, 1)
    grants = copy.deepcopy(before["rsu_grants"])
    if case == "duplicate_grant":
        grants.append(copy.deepcopy(grants[0]))
    elif case == "duplicate_event":
        grants[0]["vestings"].append(copy.deepcopy(grants[0]["vestings"][0]))
    elif case == "cross_owner":
        grants[0]["vestings"][0]["id"] = event_ids(session, 2)[0]
    elif case == "cross_grant":
        grants[0]["vestings"], grants[1]["vestings"] = grants[1]["vestings"], grants[0]["vestings"]
    elif case == "unknown_event":
        grants[0]["vestings"][0]["id"] = str(uuid4())
    elif case == "unknown_field":
        grants[0]["vestings"][0]["currency"] = "USD"
    else:
        grants[0]["vestings"][0]["net_quantity"] = "25.000000000000000000001"
    with pytest.raises(HTTPException) as error:
        update_compensation_preferences(
            session,
            1,
            {
                "salary_structure": {"2025-26": {"base_salary_annual": "1"}},
                "rsu_grants": grants,
            },
        )
    assert error.value.status_code == 422
    assert read_compensation(session, 1) == before
    assert not session.new and not session.dirty and not session.deleted


@pytest.mark.parametrize(
    "values",
    [
        {"salary_structure": None},
        {"rsu_grants": None},
        {"salary_structure": {"2025-27": {}}},
        {"salary_structure": {"2025-26": {"base_salary_annual": "NaN"}}},
        {"salary_structure": {"2025-26": {"unknown": "42"}}},
    ],
)
def test_invalid_general_preferences_values_are_422(compensation_session, values):
    with pytest.raises(HTTPException) as error:
        update_compensation_preferences(compensation_session, 1, values)
    assert error.value.status_code == 422


def test_bulk_resolution_uses_three_queries_for_many_grants(compensation_session):
    session = compensation_session
    replace_rsu_grants(session, 1, [grant(f"grant-{i}") for i in range(35)])
    replace_rsu_grants(session, 2, [grant("grant-0")])
    session.commit()
    session.expire_all()
    statements = []

    def record_sql(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(session.bind, "before_cursor_execute", record_sql)
    try:
        result = get_compensation_preferences_bulk(session, [1, 2, 3, 1])
    finally:
        event.remove(session.bind, "before_cursor_execute", record_sql)
    assert len(statements) == 3
    assert len(result[1]["rsu_grants"]) == 35
    assert len(result[2]["rsu_grants"]) == 1
    assert result[3] == {"salary_structure": {}, "rsu_grants": []}


def test_database_owner_fk_and_salary_uniqueness(compensation_session):
    session = compensation_session
    replace_salary_structure(session, 1, {"2025-26": {}})
    replace_rsu_grants(session, 1, [grant()])
    session.commit()
    parent_id = session.scalar(select(RsuGrantRecord.id))
    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(SalaryPlan(user_id=1, fiscal_year="2025-26", position=0))
        session.flush()
    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(
            RsuVestingRecord(
                user_id=2, grant_id=parent_id, position=0, date=date(2026, 1, 1), quantity=1
            )
        )
        session.flush()
    session.execute(delete(User).where(User.id == 1))
    session.flush()
    assert read_compensation(session, 1) == {"salary_structure": {}, "rsu_grants": []}


def test_tiny_price_never_rounds_through_sqlite_numeric_affinity(compensation_session):
    session = compensation_session
    payload = grant()
    payload["stock_price"] = "1E-400"
    payload["vestings"][0]["price_at_vest"] = "1E-400"
    replace_rsu_grants(session, 1, [payload])
    session.expire_all()
    saved = read_compensation(session, 1)["rsu_grants"][0]
    assert Decimal(saved["stock_price"]) == Decimal("1E-400")
    assert Decimal(saved["vestings"][0]["price_at_vest"]) == Decimal("1E-400")
    if session.bind.dialect.name == "sqlite":
        assert session.scalar(text("SELECT typeof(stock_price) FROM rsu_grants")) == "text"

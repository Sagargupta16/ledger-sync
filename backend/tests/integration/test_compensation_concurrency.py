"""Compensation identity-map freshness under caller-owned transactions and locks."""

from copy import deepcopy
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event, inspect, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from ledger_sync.core.analytics.refresh import lock_analytics_user
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

MODELS = (SalaryPlan, RsuGrantRecord, RsuVestingRecord)
VALUE_FIELDS = ("base_salary_annual", "stock_price", "price_at_vest")


@pytest.fixture
def compensation_engine(tmp_path):
    # Real separate connections; the caller supplies a unique isolated basetemp.
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'compensation-concurrency.db').as_posix()}",
        poolclass=NullPool,
    )
    Base.metadata.create_all(
        engine, tables=[User.__table__, *(model.__table__ for model in MODELS)]
    )
    with Session(engine) as session:
        session.add_all(
            [User(id=owner, email=f"comp-review-{owner}@example.test") for owner in (1, 2)]
        )
        session.commit()
        for owner in (1, 2):
            lock_analytics_user(session, owner)
            update_compensation_preferences(
                session,
                owner,
                {
                    "salary_structure": {"2026-27": {"base_salary_annual": "100"}},
                    "rsu_grants": [
                        {
                            "id": "grant-1",
                            "stock_name": "Synthetic",
                            "stock_price": "100",
                            "vestings": [
                                {"date": "2027-01-01", "quantity": 5, "price_at_vest": "100"}
                            ],
                        }
                    ],
                },
            )
        session.commit()
    yield engine
    engine.dispose()


def _cached_rows(session, owner=1):
    return tuple(
        session.scalars(select(model).where(model.user_id == owner)).one() for model in MODELS
    )


def _values(payload):
    return (
        Decimal(payload["salary_structure"]["2026-27"]["base_salary_annual"]),
        Decimal(payload["rsu_grants"][0]["stock_price"]),
        Decimal(payload["rsu_grants"][0]["vestings"][0]["price_at_vest"]),
    )


def _concurrent_change(engine, position):
    with Session(engine) as writer:
        lock_analytics_user(writer, 1)
        row = _cached_rows(writer)[position]
        setattr(row, VALUE_FIELDS[position], Decimal("200"))
        writer.commit()


@pytest.mark.parametrize("position", range(3), ids=["salary", "grant", "vesting"])
def test_replacement_does_not_mistake_pre_lock_values_for_noop(compensation_engine, position):
    with Session(compensation_engine) as waiting:
        cached = _cached_rows(waiting)
        requested = read_compensation(waiting, 1)
        _concurrent_change(compensation_engine, position)
        lock_analytics_user(waiting, 1)
        assert getattr(cached[position], VALUE_FIELDS[position]) == Decimal("100")

        if position == 0:
            changed = replace_salary_structure(waiting, 1, requested["salary_structure"])
        else:
            changed = replace_rsu_grants(waiting, 1, requested["rsu_grants"])
        assert changed
        assert waiting.in_transaction()
        waiting.commit()

    with Session(compensation_engine) as verify:
        assert _values(read_compensation(verify, 1)) == (Decimal("100"),) * 3
        assert _values(read_compensation(verify, 2)) == (Decimal("100"),) * 3


@pytest.mark.parametrize("position", range(3), ids=["salary", "grant", "vesting"])
def test_reads_reload_clean_rows_after_lock(compensation_engine, position):
    with Session(compensation_engine) as waiting:
        cached = _cached_rows(waiting)
        _concurrent_change(compensation_engine, position)
        lock_analytics_user(waiting, 1)
        assert getattr(cached[position], VALUE_FIELDS[position]) == Decimal("100")
        saved = read_compensation(waiting, 1)
        assert _values(saved)[position] == Decimal("200")
        assert getattr(cached[position], VALUE_FIELDS[position]) == Decimal("200")


@pytest.mark.parametrize("position", range(3), ids=["salary", "grant", "vesting"])
def test_pending_edits_survive_reads_and_writes_and_caller_rollback(compensation_engine, position):
    with Session(compensation_engine, autoflush=False) as session:
        lock_analytics_user(session, 1)
        cached = _cached_rows(session)
        setattr(cached[position], VALUE_FIELDS[position], Decimal("123.456789"))
        before = [inspect(row).identity for row in cached]
        statements = []

        def record(_conn, _cursor, statement, _parameters, _context, _many):
            statements.append(statement)

        event.listen(compensation_engine, "before_cursor_execute", record)
        try:
            payload = read_compensation(session, 1)
        finally:
            event.remove(compensation_engine, "before_cursor_execute", record)
        assert _values(payload)[position] == Decimal("123.456789")
        assert session.is_modified(cached[position])
        assert len(statements) == 3
        assert all(sql.lstrip().upper().startswith("SELECT") for sql in statements)

        # Re-submitting the caller's current values must neither discard them nor
        # manufacture a new change. The writer may flush, but cannot commit.
        assert not update_compensation_preferences(session, 1, payload)
        assert _values(read_compensation(session, 1))[position] == Decimal("123.456789")
        assert [inspect(row).identity for row in cached] == before
        session.rollback()
        assert _values(read_compensation(session, 1)) == (Decimal("100"),) * 3


def test_fresh_rows_match_idless_vestings_without_replacing_event_identity(compensation_engine):
    with Session(compensation_engine) as waiting:
        cached = _cached_rows(waiting)
        event_id = cached[2].id
        desired = deepcopy(read_compensation(waiting, 1)["rsu_grants"])
        desired[0]["vestings"][0].pop("id")
        desired[0]["vestings"][0]["price_at_vest"] = "200"
        _concurrent_change(compensation_engine, 2)
        lock_analytics_user(waiting, 1)
        assert not replace_rsu_grants(waiting, 1, desired)
        assert read_compensation(waiting, 1)["rsu_grants"][0]["vestings"][0]["id"] == event_id


def test_bulk_reload_uses_three_queries_and_preserves_other_owner_cache(compensation_engine):
    with Session(compensation_engine, autoflush=False) as waiting:
        current = _cached_rows(waiting)
        other = _cached_rows(waiting, 2)
        _concurrent_change(compensation_engine, 0)
        lock_analytics_user(waiting, 1)
        # Pending edits in the target and another owner must remain untouched.
        current[1].stock_price = Decimal("123")
        other[2].price_at_vest = Decimal("456")
        statements = []

        def record(_conn, _cursor, statement, _parameters, _context, _many):
            statements.append(statement)

        event.listen(compensation_engine, "before_cursor_execute", record)
        try:
            result = get_compensation_preferences_bulk(waiting, [1, 1])
        finally:
            event.remove(compensation_engine, "before_cursor_execute", record)
        assert len(statements) == 3
        assert _values(result[1]) == (Decimal("200"), Decimal("123"), Decimal("100"))
        assert current[1].stock_price == Decimal("123") and waiting.is_modified(current[1])
        assert other[2].price_at_vest == Decimal("456") and waiting.is_modified(other[2])
        assert all(not inspect(row).expired_attributes for row in other)

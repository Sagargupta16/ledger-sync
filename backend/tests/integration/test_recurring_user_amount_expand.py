"""Expand phase of ``recurring_transactions.user_expected_amount``.

Vercel can promote a backend before CI migrates the database, so the current
mapping must work against the previous head, where the column does not exist
yet. Every statement it emits for recurring rows must leave the column out.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest
import sqlalchemy as sa
from alembic import command
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from ledger_sync.api.analytics_v2_impl.recurring import router
from ledger_sync.api.deps import get_current_user
from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.db.models import Transaction, TransactionType, User, UserPreferences
from ledger_sync.db.session import get_session
from tests.integration.test_migrations_from_scratch import _config
from tests.integration.test_migrations_from_scratch import (
    migration_connection as _migration_connection,
)

migration_connection = _migration_connection

PREVIOUS_HEAD = "orm_schema_alignment_2026"
COLUMN = "user_expected_amount"
URL = "/api/analytics/v2/recurring-transactions"


def _columns(connection: sa.Connection) -> dict[str, dict]:
    return {
        column["name"]: column
        for column in sa.inspect(connection).get_columns("recurring_transactions")
    }


@pytest.fixture
def previous_head(migration_connection: sa.Connection) -> sa.Connection:
    command.upgrade(_config(migration_connection), PREVIOUS_HEAD)
    migration_connection.commit()
    if migration_connection.dialect.name == "sqlite":
        migration_connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        migration_connection.commit()
    return migration_connection


def _seed_rent(session: Session) -> User:
    user = User(email="expand@example.com", is_active=True, is_verified=True, hashed_password="")
    session.add(user)
    session.flush()
    session.add(UserPreferences(user_id=user.id, essential_categories="[]"))
    session.add_all(
        Transaction(
            transaction_id=f"rent-{month}",
            user_id=user.id,
            date=datetime(2026, month, 1, tzinfo=UTC),
            amount=Decimal("15000"),
            currency="INR",
            type=TransactionType.EXPENSE,
            account="HDFC Bank",
            category="Housing",
            note="Rent",
            source_file="expand.xlsx",
        )
        for month in range(1, 7)
    )
    session.commit()
    return user


def test_current_mapping_never_names_the_column_on_the_previous_schema(
    previous_head: sa.Connection,
) -> None:
    connection = previous_head
    assert COLUMN not in _columns(connection)
    statements: list[str] = []
    event.listen(
        connection,
        "before_cursor_execute",
        lambda _conn, _cursor, statement, *_rest: statements.append(statement),
    )
    session = Session(connection, autoflush=False)
    user = _seed_rent(session)
    engine = AnalyticsEngine(session, user_id=user.id)
    app = FastAPI()
    app.include_router(router, prefix="/api/analytics/v2")
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: session

    engine.run_full_analytics()
    session.commit()
    with TestClient(app) as client:
        detected = client.get(URL, params={"min_confidence": 0}).json()["data"][0]["id"]
        manual = client.post(
            URL, json={"name": "Gym", "type": "Expense", "frequency": "monthly", "amount": 999}
        ).json()["id"]
        statuses = [
            client.patch(f"{URL}/{detected}", json={"expected_amount": 14000}).status_code,
            client.patch(f"{URL}/{manual}", json={"expected_amount": 1099}).status_code,
        ]
        engine.run_full_analytics()
        session.commit()
        statuses += [
            client.get(URL, params={"min_confidence": 0}).status_code,
            client.delete(f"{URL}/{manual}").status_code,
            client.delete(f"{URL}/{detected}").status_code,
        ]
    session.close()

    assert statuses == [200] * 5
    recurring = [statement for statement in statements if "recurring_transactions" in statement]
    assert any(statement.lstrip().startswith("INSERT") for statement in recurring)
    assert not [statement for statement in recurring if COLUMN in statement]


def test_revision_adds_the_column_as_nullable_without_backfill(
    previous_head: sa.Connection,
) -> None:
    connection = previous_head
    session = Session(connection, autoflush=False)
    AnalyticsEngine(session, user_id=_seed_rent(session).id).run_full_analytics()
    session.commit()
    session.close()

    command.upgrade(_config(connection), "head")
    connection.commit()
    command.upgrade(_config(connection), "head")

    assert _columns(connection)[COLUMN]["nullable"] is True
    stored = connection.execute(
        sa.select(sa.column(COLUMN)).select_from(sa.table("recurring_transactions"))
    ).all()
    assert stored
    assert all(value is None for (value,) in stored)

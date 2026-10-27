"""``recurring_transactions.user_expected_amount``: the expand revision and phase 2.

The expand revision (shipped in 2.28.0) only added the column. Phase 2 reads and
writes it, so this backend needs the column; that is why it waited for the
revision to be applied in production. The user's amount is stored beside the
detected one and must survive an analytics refresh.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest
import sqlalchemy as sa
from alembic import command
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from ledger_sync.api.analytics_v2_impl.recurring import router
from ledger_sync.api.deps import get_current_user
from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.db.models import (
    RecurringTransaction,
    Transaction,
    TransactionType,
    User,
    UserPreferences,
)
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


def _upgraded(connection: sa.Connection, revision: str) -> sa.Connection:
    command.upgrade(_config(connection), revision)
    connection.commit()
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.commit()
    return connection


@pytest.fixture
def previous_head(migration_connection: sa.Connection) -> sa.Connection:
    return _upgraded(migration_connection, PREVIOUS_HEAD)


@pytest.fixture
def head(migration_connection: sa.Connection) -> sa.Connection:
    return _upgraded(migration_connection, "head")


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


def _amount_state(row: dict) -> tuple:
    return row["expected_amount"], row["detected_amount"], row["amount_edited"]


def test_user_amount_survives_refresh_and_reset_restores_detection(head: sa.Connection) -> None:
    connection = head
    assert COLUMN in _columns(connection)
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
        listed = client.get(URL, params={"min_confidence": 0})
        rows = {row["id"]: row for row in listed.json()["data"]}
        session.expire_all()
        stored = session.get(RecurringTransaction, detected)
        assert stored is not None
        stored_amounts = (stored.expected_amount, stored.user_expected_amount)
        reset = client.patch(f"{URL}/{detected}", json={"reset_amount": True})
        statuses += [
            listed.status_code,
            reset.status_code,
            client.delete(f"{URL}/{manual}").status_code,
            client.delete(f"{URL}/{detected}").status_code,
        ]
    session.close()

    assert statuses == [200] * 6
    # Refresh re-derived the detected amount and left the user's amount alone.
    assert stored_amounts == (Decimal("15000"), Decimal("14000"))
    assert _amount_state(rows[detected]) == (14000, 15000, True)
    assert listed.json()["summary"]["total_monthly_recurring"] == 14000 + 1099
    # A row added by hand owns its amount outright: nothing detected, nothing to reset.
    assert _amount_state(rows[manual]) == (1099, None, False)
    assert _amount_state(reset.json()) == (15000, 15000, False)


def test_revision_adds_the_column_as_nullable_without_backfill(
    previous_head: sa.Connection,
) -> None:
    connection = previous_head
    session = Session(connection, autoflush=False)
    user_id = _seed_rent(session).id
    session.close()
    # Phase 2 code reads the column, so the detected pattern a pre-column backend
    # stored is written with Core, naming only the columns that schema had.
    detected = datetime(2026, 6, 1, tzinfo=UTC).replace(tzinfo=None)
    money = sa.Numeric(15, 2)
    recurring = sa.table(
        "recurring_transactions",
        sa.column("user_id", sa.Integer()),
        sa.column("pattern_name", sa.String()),
        sa.column("category", sa.String()),
        sa.column("account", sa.String()),
        sa.column("transaction_type", sa.String()),
        sa.column("frequency", sa.String()),
        sa.column("expected_amount", money),
        sa.column("amount_variance", money),
        sa.column("confidence_score", sa.Float()),
        sa.column("occurrences_detected", sa.Integer()),
        sa.column("pattern_kind", sa.String()),
        sa.column("times_missed", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
        sa.column("is_user_confirmed", sa.Boolean()),
        sa.column("first_detected", sa.DateTime()),
        sa.column("last_updated", sa.DateTime()),
    )
    connection.execute(
        recurring.insert().values(
            user_id=user_id,
            pattern_name="Rent",
            category="Housing",
            account="HDFC Bank",
            transaction_type="EXPENSE",
            frequency="MONTHLY",
            expected_amount=Decimal("15000"),
            amount_variance=Decimal("0"),
            confidence_score=90.0,
            occurrences_detected=6,
            pattern_kind="commitment",
            times_missed=0,
            is_active=True,
            is_user_confirmed=False,
            first_detected=detected,
            last_updated=detected,
        )
    )
    connection.commit()

    command.upgrade(_config(connection), "head")
    connection.commit()
    command.upgrade(_config(connection), "head")

    assert _columns(connection)[COLUMN]["nullable"] is True
    stored = connection.execute(
        sa.select(sa.column(COLUMN)).select_from(sa.table("recurring_transactions"))
    ).all()
    assert stored
    assert all(value is None for (value,) in stored)

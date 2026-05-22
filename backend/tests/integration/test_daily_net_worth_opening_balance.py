import pytest
"""Integration tests for /api/calculations/daily-net-worth opening balance.

When the caller supplies a ``start_date``, the cumulative ``net_worth``
series should be seeded with the user's pre-window cashflow so the chart
doesn't reset to zero. These tests cover:

1. No start_date -> opening balance is zero (back-compat).
2. start_date set, transactions exist before it -> opening_balance is
   their net cashflow and the cumulative series starts from there.
3. Transfers before start_date are ignored (we only model income+expense
   here, matching the frontend chart's behaviour).
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.api.deps import get_current_user
from ledger_sync.api.main import app
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType, User
from ledger_sync.db.session import get_session

TEST_BCRYPT_HASH = "$2b$12$dummy_hash_for_testing_purposes"  # noqa: S105


@pytest.fixture
def session() -> Session:
    # SQLite in-memory with StaticPool so the test thread and the
    # request thread (FastAPI uses a thread per request) share the
    # same connection. Without this the FastAPI handler hits a
    # different in-memory DB and sees no rows.
    from sqlalchemy.pool import StaticPool

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_local = sessionmaker(bind=engine)
    db = session_local()
    yield db
    db.close()


@pytest.fixture
def user(session: Session) -> User:
    user = User(
        email="open-balance@example.com",
        hashed_password=TEST_BCRYPT_HASH,
        full_name="Test",
        is_active=True,
        is_verified=True,
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def client(session: Session, user: User) -> TestClient:
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_current_user] = lambda: user
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()


def _add_tx(
    session: Session,
    user_id: int,
    *,
    date: datetime,
    amount: float,
    tx_type: TransactionType,
    tid: str,
) -> None:
    session.add(
        Transaction(
            user_id=user_id,
            transaction_id=tid,
            date=date,
            amount=Decimal(str(amount)),
            currency="INR",
            type=tx_type,
            account="HDFC",
            category="Test",
            subcategory=None,
            note=None,
            source_file="test.xlsx",
            last_seen_at=datetime.now(UTC),
            is_deleted=False,
        )
    )


def test_no_start_date_opens_at_zero(
    client: TestClient, session: Session, user: User
) -> None:
    """Without a start_date the cumulative series starts from zero."""
    _add_tx(
        session,
        user.id,
        date=datetime(2025, 1, 10, tzinfo=UTC),
        amount=1000,
        tx_type=TransactionType.INCOME,
        tid="t1",
    )
    session.commit()

    resp = client.get("/api/calculations/daily-net-worth")
    assert resp.status_code == 200
    body = resp.json()
    assert body["opening_balance"] == pytest.approx(0.0)
    # First cumulative point is just the 1000 income, no opening offset.
    assert body["cumulative_data"][0]["net_worth"] == pytest.approx(1000.0)


def test_start_date_seeds_opening_balance(
    client: TestClient, session: Session, user: User
) -> None:
    """Transactions before start_date contribute to the opening balance."""
    # Pre-window: 5000 income, 1500 expense -> opening balance 3500
    _add_tx(
        session,
        user.id,
        date=datetime(2024, 11, 1, tzinfo=UTC),
        amount=5000,
        tx_type=TransactionType.INCOME,
        tid="pre1",
    )
    _add_tx(
        session,
        user.id,
        date=datetime(2024, 12, 15, tzinfo=UTC),
        amount=1500,
        tx_type=TransactionType.EXPENSE,
        tid="pre2",
    )
    # In-window: 800 income on 2025-01-05
    _add_tx(
        session,
        user.id,
        date=datetime(2025, 1, 5, tzinfo=UTC),
        amount=800,
        tx_type=TransactionType.INCOME,
        tid="in1",
    )
    session.commit()

    resp = client.get(
        "/api/calculations/daily-net-worth",
        params={"start_date": "2025-01-01T00:00:00"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["opening_balance"] == pytest.approx(3500.0)
    # Cumulative starts from opening + first in-window flow
    assert body["cumulative_data"][0]["net_worth"] == pytest.approx(3500.0 + 800.0)


def test_transfers_before_start_date_are_ignored(
    client: TestClient, session: Session, user: User
) -> None:
    """Transfers don't touch the opening balance -- the cashflow model
    only counts income and expense, matching the frontend chart."""
    # Pre-window transfer: should be ignored
    _add_tx(
        session,
        user.id,
        date=datetime(2024, 12, 1, tzinfo=UTC),
        amount=10_000,
        tx_type=TransactionType.TRANSFER,
        tid="pre-xfer",
    )
    # Pre-window income: should count
    _add_tx(
        session,
        user.id,
        date=datetime(2024, 12, 10, tzinfo=UTC),
        amount=2000,
        tx_type=TransactionType.INCOME,
        tid="pre-inc",
    )
    session.commit()

    resp = client.get(
        "/api/calculations/daily-net-worth",
        params={"start_date": "2025-01-01T00:00:00"},
    )
    assert resp.status_code == 200
    body = resp.json()
    # Only the 2000 income contributes -- the 10k transfer doesn't.
    assert body["opening_balance"] == pytest.approx(2000.0)

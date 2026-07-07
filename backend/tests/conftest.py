"""Test fixtures."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ledger_sync.api.deps import get_current_user
from ledger_sync.api.main import app
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType, User, UserPreferences
from ledger_sync.db.session import get_session

# Fake bcrypt hash for test fixtures — not a real credential
TEST_BCRYPT_HASH = "$2b$12$dummy_hash_for_testing_purposes"  # noqa: S105


@pytest.fixture
def two_user_client():
    """HTTP-boundary fixture: TestClient + two seeded users + swappable auth.

    StaticPool + check_same_thread=False shares one in-memory SQLite
    connection between the fixture thread and the TestClient request thread.
    ``current["user"]`` can be reassigned mid-test to act as the other user
    (user-scoping tests). Yields (client, session, user_a, user_b, current).
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)  # noqa: N806
    session = TestSession()

    user_a = User(email="a@example.com", is_active=True, is_verified=True, hashed_password="")
    user_b = User(email="b@example.com", is_active=True, is_verified=True, hashed_password="")
    session.add_all([user_a, user_b])
    session.flush()
    session.add(UserPreferences(user_id=user_a.id, essential_categories="[]"))
    session.add(UserPreferences(user_id=user_b.id, essential_categories="[]"))
    session.commit()

    current = {"user": user_a}

    def override_get_session():
        yield session

    def override_get_current_user():
        return current["user"]

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_current_user] = override_get_current_user

    client = TestClient(app)
    yield client, session, user_a, user_b, current

    app.dependency_overrides.clear()
    session.close()


@pytest.fixture
def test_db_session() -> Session:
    """Create a test database session."""
    # Use in-memory SQLite for tests
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    session_local = sessionmaker(bind=engine)
    session = session_local()

    yield session

    session.close()


@pytest.fixture
def test_user(test_db_session: Session) -> User:
    """Create a test user for transaction ownership."""
    user = User(
        email="test@example.com",
        hashed_password=TEST_BCRYPT_HASH,
        full_name="Test User",
        is_active=True,
        is_verified=True,
    )
    test_db_session.add(user)
    test_db_session.commit()
    return user


@pytest.fixture
def sample_transaction_data(test_user: User) -> dict:
    """Sample normalized transaction data."""
    return {
        "date": datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC),
        "amount": Decimal("100.50"),
        "currency": "INR",
        "type": TransactionType.EXPENSE,
        "account": "Cash",
        "category": "Food",
        "subcategory": "Groceries",
        "note": "Weekly shopping",
        "user_id": test_user.id,
    }


@pytest.fixture
def sample_transaction(test_db_session: Session, test_user: User) -> Transaction:
    """Create a sample transaction in the database with an old timestamp."""
    # Use an old timestamp so soft delete tests work correctly
    old_timestamp = datetime.now(UTC) - timedelta(days=1)
    transaction = Transaction(
        user_id=test_user.id,
        transaction_id="test123",
        date=datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC),
        amount=Decimal("100.50"),
        currency="INR",
        type=TransactionType.EXPENSE,
        account="Cash",
        category="Food",
        subcategory="Groceries",
        note="Weekly shopping",
        source_file="test.xlsx",
        last_seen_at=old_timestamp,
        is_deleted=False,
    )
    test_db_session.add(transaction)
    test_db_session.commit()

    return transaction

"""Test fixtures."""

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType


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
def sample_transaction_data() -> dict:
    """Sample normalized transaction data."""
    return {
        "date": datetime(2024, 1, 15, 10, 30, 0),
        "amount": Decimal("100.50"),
        "currency": "INR",
        "type": TransactionType.EXPENSE,
        "account": "Cash",
        "category": "Food",
        "subcategory": "Groceries",
        "note": "Weekly shopping",
    }


@pytest.fixture
def sample_transaction(test_db_session: Session) -> Transaction:
    """Create a sample transaction in the database."""
    transaction = Transaction(
        transaction_id="test123",
        date=datetime(2024, 1, 15, 10, 30, 0),
        amount=Decimal("100.50"),
        currency="INR",
        type=TransactionType.EXPENSE,
        account="Cash",
        category="Food",
        subcategory="Groceries",
        note="Weekly shopping",
        source_file="test.xlsx",
        last_seen_at=datetime.now(UTC),
        is_deleted=False,
    )
    test_db_session.add(transaction)
    test_db_session.commit()

    return transaction

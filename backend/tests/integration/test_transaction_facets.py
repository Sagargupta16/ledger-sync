"""Integration tests for the GET /api/transactions/facets endpoint.

The facets endpoint replaced three full-ledger fetches on the Transactions
page. These tests lock in the behaviour the page depends on:

1. Distinct categories/accounts + per-type counts are correct.
2. Counts/options are user-scoped (no cross-user leakage).
3. Soft-deleted rows are excluded.
4. The user's excluded_accounts preference is honoured.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.api.transactions import get_transaction_facets
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType, User, UserPreferences

# Fake bcrypt hash for test fixtures -- not a real credential.
TEST_BCRYPT_HASH = "$2b$12$dummy_hash_for_testing_purposes"  # noqa: S105


@pytest.fixture
def facets_db() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def _make_user(session: Session, email: str) -> User:
    user = User(
        email=email,
        hashed_password=TEST_BCRYPT_HASH,
        full_name=email,
        is_active=True,
        is_verified=True,
    )
    session.add(user)
    session.commit()
    return user


def _add(
    session: Session,
    user_id: int,
    tx_id: str,
    tx_type: TransactionType,
    account: str,
    category: str,
    *,
    is_deleted: bool = False,
    from_account: str | None = None,
    to_account: str | None = None,
) -> None:
    session.add(
        Transaction(
            user_id=user_id,
            transaction_id=tx_id,
            date=datetime(2024, 1, 15, tzinfo=UTC),
            amount=Decimal("100.00"),
            currency="INR",
            type=tx_type,
            account=account,
            category=category,
            from_account=from_account,
            to_account=to_account,
            source_file="test.xlsx",
            last_seen_at=datetime(2024, 1, 15, tzinfo=UTC),
            is_deleted=is_deleted,
        )
    )


def _call(user: User, db: Session):
    return asyncio.run(get_transaction_facets(user, db))


def test_facets_returns_distinct_options_and_type_counts(facets_db: Session) -> None:
    user = _make_user(facets_db, "a@example.com")
    _add(facets_db, user.id, "1", TransactionType.INCOME, "HDFC", "Salary")
    _add(facets_db, user.id, "2", TransactionType.EXPENSE, "HDFC", "Food")
    _add(facets_db, user.id, "3", TransactionType.EXPENSE, "Cash", "Food")
    _add(facets_db, user.id, "4", TransactionType.TRANSFER, "HDFC", "Transfer")
    facets_db.commit()

    res = _call(user, facets_db)

    # Distinct, sorted (case-insensitive).
    assert res.categories == ["Food", "Salary", "Transfer"]
    assert res.accounts == ["Cash", "HDFC"]
    assert res.income_count == 1
    assert res.expense_count == 2
    assert res.transfer_count == 1
    assert res.total_count == 4


def test_facets_are_user_scoped(facets_db: Session) -> None:
    alice = _make_user(facets_db, "alice@example.com")
    bob = _make_user(facets_db, "bob@example.com")
    _add(facets_db, alice.id, "a1", TransactionType.EXPENSE, "Alice Bank", "Food")
    _add(facets_db, bob.id, "b1", TransactionType.EXPENSE, "Bob Bank", "Rent")
    facets_db.commit()

    res = _call(alice, facets_db)

    assert res.accounts == ["Alice Bank"]
    assert res.categories == ["Food"]
    assert res.total_count == 1


def test_facets_exclude_soft_deleted(facets_db: Session) -> None:
    user = _make_user(facets_db, "c@example.com")
    _add(facets_db, user.id, "live", TransactionType.EXPENSE, "HDFC", "Food")
    _add(
        facets_db,
        user.id,
        "dead",
        TransactionType.EXPENSE,
        "GhostBank",
        "GhostCategory",
        is_deleted=True,
    )
    facets_db.commit()

    res = _call(user, facets_db)

    assert "GhostBank" not in res.accounts
    assert "GhostCategory" not in res.categories
    assert res.expense_count == 1
    assert res.total_count == 1


def test_facets_honour_excluded_accounts(facets_db: Session) -> None:
    user = _make_user(facets_db, "d@example.com")
    facets_db.add(
        UserPreferences(user_id=user.id, excluded_accounts=json.dumps(["Excluded Wallet"]))
    )
    _add(facets_db, user.id, "keep", TransactionType.EXPENSE, "HDFC", "Food")
    _add(facets_db, user.id, "drop", TransactionType.EXPENSE, "Excluded Wallet", "Food")
    facets_db.commit()

    res = _call(user, facets_db)

    assert "Excluded Wallet" not in res.accounts
    assert res.accounts == ["HDFC"]
    assert res.expense_count == 1

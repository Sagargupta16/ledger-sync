"""Integration tests for AnalyticsEngine user-scoping and zero-guard fixes.

Covers:
1. _require_user_id raises when engine is constructed without a user_id.
2. Anomaly queries no longer divide by zero when all months have zero expenses.
3. Anomaly queries filter by the scoped user_id (no cross-user leakage).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType, User

# Fake bcrypt hash for test fixtures -- not a real credential.
TEST_BCRYPT_HASH = "$2b$12$dummy_hash_for_testing_purposes"  # noqa: S105


@pytest.fixture
def analytics_db() -> Session:
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


def _seed_expenses(session: Session, user_id: int, amounts: list[float]) -> None:
    """Seed one expense per amount across consecutive months starting Jan 2024."""
    now = datetime.now(UTC) - timedelta(days=1)
    for i, amt in enumerate(amounts):
        session.add(
            Transaction(
                user_id=user_id,
                transaction_id=f"u{user_id}-m{i}",
                date=datetime(2024, 1 + i, 15, tzinfo=UTC),
                amount=Decimal(str(amt)),
                currency="INR",
                type=TransactionType.EXPENSE,
                account="HDFC",
                category="Food",
                subcategory=None,
                note=None,
                source_file="test.xlsx",
                last_seen_at=now,
                is_deleted=False,
            ),
        )
    session.commit()


def test_require_user_id_raises_when_none(analytics_db: Session) -> None:
    engine = AnalyticsEngine(analytics_db, user_id=None)
    with pytest.raises(RuntimeError, match="requires a user_id"):
        engine._require_user_id()


def test_detect_high_expense_months_is_zero_safe(analytics_db: Session) -> None:
    """All-zero monthly expenses must not raise ZeroDivisionError."""
    user = _make_user(analytics_db, "zero@example.com")
    # Seed 5 months of expenses that each sum to zero (single 0-amount txn)
    _seed_expenses(analytics_db, user.id, [0.0, 0.0, 0.0, 0.0, 0.0])

    engine = AnalyticsEngine(analytics_db, user_id=user.id)
    anomalies: list[dict] = []
    # Must not raise; must simply produce no anomalies.
    engine._detect_high_expense_months(anomalies, threshold_multiplier=2.0)
    assert anomalies == []


def test_detect_high_expense_months_scopes_by_user(analytics_db: Session) -> None:
    """User A's aggregated expenses must not influence user B's anomaly detection."""
    user_a = _make_user(analytics_db, "a@example.com")
    user_b = _make_user(analytics_db, "b@example.com")

    # User A: 5 quiet months of 1000, one huge month of 50_000
    _seed_expenses(analytics_db, user_a.id, [1000, 1000, 1000, 1000, 1000, 50_000])
    # User B: 6 quiet months of 1000 -- should produce no anomalies for B.
    _seed_expenses(analytics_db, user_b.id, [1000, 1000, 1000, 1000, 1000, 1000])

    engine_b = AnalyticsEngine(analytics_db, user_id=user_b.id)
    anomalies_b: list[dict] = []
    engine_b._detect_high_expense_months(anomalies_b, threshold_multiplier=2.0)
    assert anomalies_b == [], "User B should see no anomalies despite A's outlier"


def test_detect_high_expense_months_flags_true_outlier(analytics_db: Session) -> None:
    user = _make_user(analytics_db, "outlier@example.com")
    _seed_expenses(analytics_db, user.id, [1000, 1000, 1000, 1000, 1000, 50_000])

    engine = AnalyticsEngine(analytics_db, user_id=user.id)
    anomalies: list[dict] = []
    engine._detect_high_expense_months(anomalies, threshold_multiplier=2.0)
    assert len(anomalies) == 1
    assert anomalies[0]["period_key"] == "2024-06"


def test_detect_large_transactions_scopes_by_user(analytics_db: Session) -> None:
    """Large-transaction detection must compute the category average per-user."""
    user_a = _make_user(analytics_db, "ca@example.com")
    user_b = _make_user(analytics_db, "cb@example.com")

    # User A has many small Food purchases -> low avg; User B has one big Food purchase.
    _seed_expenses(analytics_db, user_a.id, [100, 100, 100, 100, 100])
    _seed_expenses(analytics_db, user_b.id, [10_000])

    # From user B's perspective, a single 10k transaction equals the category avg,
    # so no "3x above avg" anomaly should trigger. If the query leaked, B would
    # see a very low cross-user avg and 10k would falsely appear as an outlier.
    engine_b = AnalyticsEngine(analytics_db, user_id=user_b.id)
    anomalies_b: list[dict] = []
    engine_b._detect_large_transactions(anomalies_b)
    assert anomalies_b == []


def test_excluded_accounts_filter_drops_transfer_endpoints(analytics_db: Session) -> None:
    """A transfer landing in an excluded account must not appear in the user query.

    Regression test: previously the filter only checked ``Transaction.account``.
    For transfers, ``account = from_account``, so a transfer FROM a regular
    account TO an excluded account passed the filter and silently inflated
    net worth via ``compute_account_balances``.
    """
    from ledger_sync.db.models import UserPreferences

    user = _make_user(analytics_db, "transfer-exclude@example.com")
    analytics_db.add(
        UserPreferences(
            user_id=user.id,
            excluded_accounts='["Wife Account"]',
        ),
    )
    now = datetime.now(UTC) - timedelta(days=1)

    # Three rows for the same user:
    #   1. Plain expense from HDFC (kept)
    #   2. Transfer FROM HDFC TO "Wife Account" (must be dropped)
    #   3. Transfer FROM "Wife Account" TO HDFC (must be dropped)
    analytics_db.add_all(
        [
            Transaction(
                user_id=user.id,
                transaction_id="t-keep",
                date=datetime(2024, 1, 15, tzinfo=UTC),
                amount=Decimal("100"),
                currency="INR",
                type=TransactionType.EXPENSE,
                account="HDFC",
                category="Food",
                source_file="test.xlsx",
                last_seen_at=now,
                is_deleted=False,
            ),
            Transaction(
                user_id=user.id,
                transaction_id="t-out-to-wife",
                date=datetime(2024, 2, 15, tzinfo=UTC),
                amount=Decimal("5000"),
                currency="INR",
                type=TransactionType.TRANSFER,
                account="HDFC",
                from_account="HDFC",
                to_account="Wife Account",
                category="Transfer",
                source_file="test.xlsx",
                last_seen_at=now,
                is_deleted=False,
            ),
            Transaction(
                user_id=user.id,
                transaction_id="t-in-from-wife",
                date=datetime(2024, 3, 15, tzinfo=UTC),
                amount=Decimal("3000"),
                currency="INR",
                type=TransactionType.TRANSFER,
                account="Wife Account",
                from_account="Wife Account",
                to_account="HDFC",
                category="Transfer",
                source_file="test.xlsx",
                last_seen_at=now,
                is_deleted=False,
            ),
        ]
    )
    analytics_db.commit()

    engine = AnalyticsEngine(analytics_db, user_id=user.id)
    rows = engine._user_transaction_query().all()

    assert {tx.transaction_id for tx in rows} == {"t-keep"}, (
        "Both transfer rows touching 'Wife Account' should be filtered, "
        f"got {[tx.transaction_id for tx in rows]}"
    )

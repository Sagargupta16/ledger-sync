"""Time-range filters anchor on ``now()``, not on the latest transaction.

Covers both implementations:
- ``ledger_sync.core.time_filter.TimeFilter`` (in-memory list filter)
- ``ledger_sync.api.analytics_helpers._get_time_range_dates`` (DB query)

The behaviour change matters for users with stale data: clicking
"This Month" should yield the current calendar month even if their data
is months old, instead of returning the latest data month under a
misleading label.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.api.analytics_helpers import _get_time_range_dates
from ledger_sync.core.time_filter import TimeFilter, TimeRange
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType, User

TEST_BCRYPT_HASH = "$2b$12$dummy_hash_for_testing_purposes"  # noqa: S105


@pytest.fixture
def db_session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_local = sessionmaker(bind=engine)
    db = session_local()
    yield db
    db.close()


@pytest.fixture
def user(db_session: Session) -> User:
    user = User(
        email="now-anchor@example.com",
        hashed_password=TEST_BCRYPT_HASH,
        full_name="Test",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


def _make_tx(
    user_id: int, date: datetime, amount: float, tid: str
) -> Transaction:
    return Transaction(
        user_id=user_id,
        transaction_id=tid,
        date=date,
        amount=Decimal(str(amount)),
        currency="INR",
        type=TransactionType.EXPENSE,
        account="HDFC",
        category="Test",
        subcategory=None,
        note=None,
        source_file="test.xlsx",
        last_seen_at=datetime.now(UTC),
        is_deleted=False,
    )


# ─── core/time_filter.py ────────────────────────────────────────────────


def test_in_memory_this_month_uses_now_not_latest_tx() -> None:
    """A user whose data ends 6 months ago clicks 'This Month' -> empty
    result, because it's truly not this month."""
    fake_now = datetime(2026, 5, 15, tzinfo=UTC)
    txns = [_make_tx(1, datetime(2025, 11, 5, tzinfo=UTC), 100, "old1")]

    with patch("ledger_sync.core.time_filter.datetime") as mock_dt:
        mock_dt.now.return_value = fake_now
        mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
        result = TimeFilter.filter_by_range(txns, TimeRange.THIS_MONTH)

    assert result == []  # Nov 2025 data, May 2026 "this month" -> empty.


def test_in_memory_last_3_months_calendar_aligned() -> None:
    """'Last 3 months' should snap to the first of (now - 2 months), not a
    fixed 90-day window."""
    fake_now = datetime(2026, 5, 15, tzinfo=UTC)
    # Mar 2026, Apr 2026, May 2026 should be included
    in_range = [
        _make_tx(1, datetime(2026, 3, 1, tzinfo=UTC), 100, "mar"),
        _make_tx(1, datetime(2026, 4, 15, tzinfo=UTC), 100, "apr"),
        _make_tx(1, datetime(2026, 5, 10, tzinfo=UTC), 100, "may"),
    ]
    # Feb 28 should be excluded -- it's just before the calendar start
    out_of_range = _make_tx(1, datetime(2026, 2, 28, tzinfo=UTC), 100, "feb")

    txns = [*in_range, out_of_range]

    with patch("ledger_sync.core.time_filter.datetime") as mock_dt:
        mock_dt.now.return_value = fake_now
        mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
        result = TimeFilter.filter_by_range(txns, TimeRange.LAST_3_MONTHS)

    assert {t.transaction_id for t in result} == {"mar", "apr", "may"}


def test_in_memory_empty_returns_empty() -> None:
    assert TimeFilter.filter_by_range([], TimeRange.THIS_MONTH) == []


# ─── api/analytics_helpers.py ───────────────────────────────────────────


def test_db_this_month_anchors_on_now(db_session: Session, user: User) -> None:
    """Even when latest tx was months ago, THIS_MONTH range starts at the
    first of the current calendar month."""
    db_session.add(_make_tx(user.id, datetime(2025, 11, 5, tzinfo=UTC), 100, "old"))
    db_session.commit()

    fake_now = datetime(2026, 5, 17, 10, 30, 0, tzinfo=UTC)
    with patch("ledger_sync.api.analytics_helpers.datetime") as mock_dt:
        mock_dt.now.return_value = fake_now
        mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
        start, end = _get_time_range_dates(db_session, user, TimeRange.THIS_MONTH)

    assert start == datetime(2026, 5, 1, tzinfo=UTC)
    assert end is None  # open-ended (covers from start through "now")


def test_db_last_3_months_calendar_aligned(db_session: Session, user: User) -> None:
    db_session.add(_make_tx(user.id, datetime(2025, 11, 5, tzinfo=UTC), 100, "old"))
    db_session.commit()

    fake_now = datetime(2026, 5, 17, tzinfo=UTC)
    with patch("ledger_sync.api.analytics_helpers.datetime") as mock_dt:
        mock_dt.now.return_value = fake_now
        mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
        start, end = _get_time_range_dates(db_session, user, TimeRange.LAST_3_MONTHS)

    # 3 calendar months ending in May = Mar 1, Apr 1, May 1 -> start = Mar 1.
    assert start == datetime(2026, 3, 1, tzinfo=UTC)
    assert end is None


def test_db_last_year_uses_now_year(db_session: Session, user: User) -> None:
    """LAST_YEAR is (now.year - 1), regardless of latest transaction year."""
    db_session.add(_make_tx(user.id, datetime(2023, 6, 1, tzinfo=UTC), 100, "old"))
    db_session.commit()

    fake_now = datetime(2026, 5, 17, tzinfo=UTC)
    with patch("ledger_sync.api.analytics_helpers.datetime") as mock_dt:
        mock_dt.now.return_value = fake_now
        mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
        start, end = _get_time_range_dates(db_session, user, TimeRange.LAST_YEAR)

    assert start == datetime(2025, 1, 1, tzinfo=UTC)
    assert end == datetime(2025, 12, 31, 23, 59, 59, tzinfo=UTC)


def test_db_no_transactions_returns_none(db_session: Session, user: User) -> None:
    """User with no data still gets (None, None) so callers handle empty
    state gracefully."""
    start, end = _get_time_range_dates(db_session, user, TimeRange.THIS_MONTH)
    assert start is None
    assert end is None


def test_db_all_time_returns_none(db_session: Session, user: User) -> None:
    db_session.add(_make_tx(user.id, datetime(2025, 1, 1, tzinfo=UTC), 100, "any"))
    db_session.commit()
    start, end = _get_time_range_dates(db_session, user, TimeRange.ALL_TIME)
    assert start is None
    assert end is None

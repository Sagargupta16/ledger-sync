"""Recurring detection -- amount statistics and confirmed-pattern matching.

Pins two behaviours of ``_detect_recurring_transactions``:

* ``expected_amount`` / ``amount_variance`` use median + scaled MAD so a
  stray adjustment row under the same note cannot drag the stored amount
  (a single outlier used to skew the mean by 25-273% on real data).
* Confirmed-pattern lookup matches on the stable group label: a confirmed
  record whose ``pattern_name`` carries a date trailer ("Rent Mar 2026")
  is updated in place instead of spawning an unconfirmed duplicate while
  the confirmed row's stats freeze.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.db.base import Base
from ledger_sync.db.models import (
    RecurrenceFrequency,
    RecurringTransaction,
    Transaction,
    TransactionType,
    User,
)


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


@pytest.fixture
def user(session: Session) -> User:
    user = User(email="rec@example.com", hashed_password="", is_active=True, is_verified=True)
    session.add(user)
    session.commit()
    return user


def _txn(
    user_id: int,
    idx: int,
    date: datetime,
    amount: str,
    note: str,
) -> Transaction:
    return Transaction(
        transaction_id=f"txn-{idx}",
        user_id=user_id,
        date=date,
        amount=Decimal(amount),
        currency="INR",
        type=TransactionType.EXPENSE,
        account="HDFC Bank",
        category="Housing",
        note=note,
        source_file="test.xlsx",
    )


def _monthly_dates(n: int) -> list[datetime]:
    return [datetime(2026, month, 1, tzinfo=UTC) for month in range(1, n + 1)]


def _detect(session: Session, user: User, txns: list[Transaction]) -> list[RecurringTransaction]:
    session.add_all(txns)
    session.commit()
    engine = AnalyticsEngine(session, user_id=user.id)
    engine._detect_recurring_transactions(txns)
    session.commit()
    return session.query(RecurringTransaction).all()


def test_expected_amount_uses_median_not_mean(session: Session, user: User) -> None:
    """One stray 10,000 row must not drag the stored amount off 100."""
    amounts = ["100", "100", "100", "10000"]
    txns = [_txn(user.id, i, d, amounts[i], "Rent") for i, d in enumerate(_monthly_dates(4))]
    records = _detect(session, user, txns)
    assert len(records) == 1
    assert records[0].expected_amount == Decimal("100")  # mean would be 2575
    assert records[0].amount_variance == Decimal("0")  # MAD of [0,0,0,9900] is 0


def test_amount_variance_is_scaled_mad(session: Session, user: User) -> None:
    """Variance = 1.4826 * MAD, in stdev-like units, robust to the outlier."""
    amounts = ["100", "110", "90", "10000"]
    txns = [_txn(user.id, i, d, amounts[i], "Rent") for i, d in enumerate(_monthly_dates(4))]
    records = _detect(session, user, txns)
    assert len(records) == 1
    # median = 105; |dev| = [5, 5, 15, 9895]; MAD = 10; 1.4826 * 10 = 14.826
    # (column scale is 2, so compare at cent precision)
    assert float(records[0].expected_amount) == pytest.approx(105)
    assert float(records[0].amount_variance) == pytest.approx(14.83, abs=0.01)


def test_confirmed_pattern_with_date_trailer_updates_in_place(
    session: Session,
    user: User,
) -> None:
    """A confirmed 'Rent Mar 2026' record matches the 'rent' group label.

    The refresh must update the confirmed row's stats instead of creating
    an unconfirmed duplicate and freezing the confirmed one.
    """
    session.add(
        RecurringTransaction(
            user_id=user.id,
            pattern_name="Rent Mar 2026",
            category="Housing",
            account="HDFC Bank",
            transaction_type=TransactionType.EXPENSE,
            frequency=RecurrenceFrequency.MONTHLY,
            expected_amount=Decimal("100"),
            amount_variance=Decimal("0"),
            confidence_score=90,
            occurrences_detected=3,
            is_user_confirmed=True,
            is_active=True,
        )
    )
    session.commit()

    notes = ["Rent Jan 2026", "Rent Feb 2026", "Rent Mar 2026", "Rent Apr 2026"]
    txns = [_txn(user.id, i, d, "150", notes[i]) for i, d in enumerate(_monthly_dates(4))]
    records = _detect(session, user, txns)

    assert len(records) == 1  # no unconfirmed duplicate
    assert records[0].is_user_confirmed is True
    assert records[0].occurrences_detected == 4
    assert records[0].expected_amount == Decimal("150")
    assert records[0].last_occurrence == datetime(2026, 4, 1)


def test_confirmed_pattern_exact_name_still_matches(session: Session, user: User) -> None:
    """Plain lowercase matching (no trailer) keeps working for manual records."""
    session.add(
        RecurringTransaction(
            user_id=user.id,
            pattern_name="Netflix",
            category="Entertainment",
            account="HDFC Bank",
            transaction_type=TransactionType.EXPENSE,
            frequency=RecurrenceFrequency.MONTHLY,
            expected_amount=Decimal("649"),
            amount_variance=Decimal("0"),
            confidence_score=100,
            occurrences_detected=0,
            is_user_confirmed=True,
            is_active=True,
        )
    )
    session.commit()

    txns = [_txn(user.id, i, d, "649", "Netflix") for i, d in enumerate(_monthly_dates(3))]
    records = _detect(session, user, txns)

    assert len(records) == 1
    assert records[0].is_user_confirmed is True
    assert records[0].occurrences_detected == 3

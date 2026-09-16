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
    # ``last_occurrence`` is a naive ``DateTime`` column, so the aware Apr-1
    # input above comes back tz-stripped. Compare against the stored wall
    # clock rather than re-attaching UTC, which would never be equal.
    assert records[0].last_occurrence == datetime(2026, 4, 1, tzinfo=UTC).replace(tzinfo=None)


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


@pytest.mark.parametrize(
    ("note", "category", "subcategory", "expected_kind"),
    [
        ("", "Housing", None, "habit"),
        ("", "Family", None, "habit"),
        ("Bus pass top-up", "Transportation", "Daily Commute", "habit"),
        ("Grooming products", "Personal Care", None, "habit"),
        ("Dinner", "Food & Dining", None, "habit"),
        ("Rent refund", "Housing", None, "habit"),
        ("Rent", "Housing", None, "commitment"),
        ("Maid - Helper A", "Family", "Domestic Help", "commitment"),
        ("Cook - Helper B", "Family", "Domestic Help", "commitment"),
        ("Electricity", "Utilities", None, "commitment"),
        ("Unknown provider", "Subscriptions", None, "commitment"),
        ("Netflix", "Entertainment", None, "commitment"),
    ],
)
def test_calendar_regularity_alone_does_not_make_a_bill(
    session: Session,
    user: User,
    note: str,
    category: str,
    subcategory: str | None,
    expected_kind: str,
) -> None:
    txns = [_txn(user.id, i, d, "500", note) for i, d in enumerate(_monthly_dates(4))]
    for txn in txns:
        txn.category = category
        txn.subcategory = subcategory
    records = _detect(session, user, txns)
    assert len(records) == 1
    assert records[0].pattern_kind == expected_kind
    assert records[0].is_user_confirmed is False


def test_weekly_domestic_help_is_a_commitment(session: Session, user: User) -> None:
    dates = [datetime(2026, 1, day, tzinfo=UTC) for day in (3, 10, 17, 24)]
    txns = [_txn(user.id, i, d, "500", "Maid - Helper A") for i, d in enumerate(dates)]
    records = _detect(session, user, txns)
    assert records[0].frequency == RecurrenceFrequency.WEEKLY
    assert records[0].pattern_kind == "commitment"


@pytest.mark.parametrize(
    "date_specs",
    [
        [(2026, 1, 3), (2026, 2, 12), (2026, 3, 24), (2026, 4, 8), (2026, 5, 19)],
        [(2026, 1, 1), (2026, 1, 11), (2026, 1, 21), (2026, 1, 31)],
        [(2026, 1, 2), (2026, 1, 3), (2026, 2, 2), (2026, 2, 4), (2026, 3, 2), (2026, 3, 3)],
    ],
)
def test_bill_wording_cannot_override_unsupported_calendar_timing(
    session: Session, user: User, date_specs: list[tuple[int, int, int]]
) -> None:
    txns = [
        _txn(user.id, i, datetime(*spec, tzinfo=UTC), "500", "Rent")
        for i, spec in enumerate(date_specs)
    ]
    records = _detect(session, user, txns)
    assert all(record.pattern_kind == "habit" for record in records)


def test_numbered_payees_are_not_merged(session: Session, user: User) -> None:
    txns = [
        _txn(user.id, provider * 10 + i, d, str(provider * 100), f"Internet provider {provider}")
        for provider in (1, 2)
        for i, d in enumerate(_monthly_dates(4))
    ]
    records = _detect(session, user, txns)
    assert {r.pattern_name for r in records} == {"Internet provider 1", "Internet provider 2"}
    assert all(r.occurrences_detected == 4 for r in records)
    assert {r.expected_amount for r in records} == {Decimal("100"), Decimal("200")}


def test_manual_commitment_amount_and_state_survive_matching_detection(
    session: Session, user: User
) -> None:
    session.add(
        RecurringTransaction(
            user_id=user.id,
            pattern_name="Netflix",
            category="Entertainment",
            account="Manual",
            transaction_type=TransactionType.EXPENSE,
            frequency=RecurrenceFrequency.YEARLY,
            expected_amount=Decimal("1200"),
            amount_variance=Decimal("0"),
            expected_day=15,
            confidence_score=100,
            occurrences_detected=0,
            pattern_kind="commitment",
            is_user_confirmed=True,
            is_active=False,
        )
    )
    session.commit()
    txns = [_txn(user.id, i, d, "99", "Netflix") for i, d in enumerate(_monthly_dates(4))]
    records = _detect(session, user, txns)
    assert len(records) == 1
    assert records[0].expected_amount == Decimal("1200")
    assert records[0].expected_day == 15
    assert records[0].frequency == RecurrenceFrequency.YEARLY
    assert records[0].is_active is False


def test_confirmed_numbered_payees_keep_separate_history(session: Session, user: User) -> None:
    for provider in (1, 2):
        session.add(
            RecurringTransaction(
                user_id=user.id,
                pattern_name=f"Internet provider {provider}",
                category="Utilities",
                account="Manual",
                transaction_type=TransactionType.EXPENSE,
                frequency=RecurrenceFrequency.MONTHLY,
                expected_amount=Decimal(provider * 100),
                amount_variance=Decimal("0"),
                confidence_score=100,
                occurrences_detected=0,
                pattern_kind="commitment",
                is_user_confirmed=True,
                is_active=True,
            )
        )
    session.commit()
    txns = [
        _txn(user.id, provider * 10 + i, d, str(provider * 100), f"Internet provider {provider}")
        for provider in (1, 2)
        for i, d in enumerate(_monthly_dates(4))
    ]
    records = _detect(session, user, txns)
    assert len(records) == 2
    assert all(r.occurrences_detected == 4 for r in records)


def test_payee_names_that_begin_with_month_names_are_not_trimmed(
    session: Session, user: User
) -> None:
    txns = [
        _txn(user.id, provider * 10 + i, d, "500", name)
        for provider, name in enumerate(("Maid - Marchant", "Maid - May"))
        for i, d in enumerate(_monthly_dates(4))
    ]
    records = _detect(session, user, txns)
    assert {r.pattern_name for r in records} == {"Maid - Marchant", "Maid - May"}

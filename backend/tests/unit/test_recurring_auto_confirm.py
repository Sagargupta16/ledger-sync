"""Detection must never write ``is_user_confirmed`` -- and why.

``recurring_auto_confirm_occurrences`` reads like an invitation for the detector
to promote its own guesses ("auto-confirm after N occurrences"). It is not one.
``is_user_confirmed`` is the flag that makes a row SURVIVE a refresh while every
other row is deleted and re-derived, so a detector that sets it turns each guess
into an immortal, frozen row:

* a cancelled subscription keeps billing forever (its transactions are gone, but
  the row is preserved),
* a renamed note spawns a second row while the stale one is still summed into
  ``total_monthly_recurring``,
* and the user cannot undo it -- with one boolean and no "rejected" state, the
  next refresh re-detects and re-promotes the row they just rejected.

These tests pin the four invariants that keep detected rows honest, plus the
two properties of the confirmed-row update path they depend on.
"""

from __future__ import annotations

import calendar
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
    UserPreferences,
)


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    yield db
    db.close()


@pytest.fixture
def user(session: Session) -> User:
    user = User(email="auto@example.com", hashed_password="", is_active=True, is_verified=True)
    session.add(user)
    session.commit()
    return user


def _monthly_dates(n: int, day: int = 1) -> list[datetime]:
    """N consecutive month-ends anchored on *day*, clamped to short months."""
    out: list[datetime] = []
    year, month = 2024, 1
    for _ in range(n):
        out.append(datetime(year, month, min(day, calendar.monthrange(year, month)[1]), tzinfo=UTC))
        month += 1
        if month > 12:
            month = 1
            year += 1
    return out


def _txns(
    user_id: int,
    dates: list[datetime],
    note: str,
    amount: str,
    txn_type: TransactionType = TransactionType.EXPENSE,
) -> list[Transaction]:
    return [
        Transaction(
            transaction_id=f"{note}-{txn_type.value}-{i}",
            user_id=user_id,
            date=d,
            amount=Decimal(amount),
            currency="INR",
            type=txn_type,
            account="HDFC Bank",
            category="Housing",
            note=note,
            source_file="test.xlsx",
        )
        for i, d in enumerate(dates)
    ]


def _confirmed(
    user_id: int,
    name: str,
    *,
    txn_type: TransactionType = TransactionType.EXPENSE,
    expected_day: int | None = None,
    amount: str = "1",
) -> RecurringTransaction:
    return RecurringTransaction(
        user_id=user_id,
        pattern_name=name,
        category="Housing",
        account="HDFC Bank",
        transaction_type=txn_type,
        frequency=RecurrenceFrequency.MONTHLY,
        expected_amount=Decimal(amount),
        amount_variance=Decimal("0"),
        expected_day=expected_day,
        confidence_score=90,
        occurrences_detected=1,
        pattern_kind="commitment",
        is_user_confirmed=True,
        is_active=True,
    )


def _refresh(session: Session, user: User, txns: list[Transaction]) -> list[RecurringTransaction]:
    """Run one detection pass over *txns* without seeding them."""
    engine = AnalyticsEngine(session, user_id=user.id)
    engine._detect_recurring_transactions(txns)
    session.commit()
    return session.query(RecurringTransaction).all()


def _detect(session: Session, user: User, txns: list[Transaction]) -> list[RecurringTransaction]:
    session.add_all(txns)
    session.commit()
    return _refresh(session, user, txns)


def _set_threshold(session: Session, user: User, occurrences: int) -> None:
    session.add(UserPreferences(user_id=user.id, recurring_auto_confirm_occurrences=occurrences))
    session.commit()


def test_a_long_running_commitment_is_detected_but_not_confirmed(
    session: Session,
    user: User,
) -> None:
    """21 monthly rent payments: an unmistakable bill, still only DETECTED.

    Confirmation is the user's word, not the detector's. The row is fully
    usable -- surfaces render detected commitments and label them as such.
    """
    _set_threshold(session, user, 6)

    records = _detect(session, user, _txns(user.id, _monthly_dates(21), "Rent", "19500"))

    assert len(records) == 1
    assert records[0].pattern_kind == "commitment"
    assert records[0].occurrences_detected == 21
    assert records[0].is_user_confirmed is False


def test_the_occurrence_preference_does_not_promote_anything(
    session: Session,
    user: User,
) -> None:
    """Even a threshold of 2 -- below any plausible fallback -- confirms nothing.

    Pins the absence of a promotion gate rather than a particular threshold
    value, so no fallback constant can quietly re-enable auto-confirmation.
    """
    _set_threshold(session, user, 2)

    records = _detect(session, user, _txns(user.id, _monthly_dates(12), "Rent", "19500"))

    assert len(records) == 1
    assert records[0].occurrences_detected == 12
    assert records[0].is_user_confirmed is False


def test_a_cancelled_pattern_disappears_on_the_next_refresh(
    session: Session,
    user: User,
) -> None:
    """Netflix is cancelled -- its rows are gone, so the pattern must go too.

    A detected row that outlived its transactions would keep showing up as an
    active monthly commitment forever. This is exactly what confirming a
    detection automatically would have broken.
    """
    txns = _txns(user.id, _monthly_dates(8), "Netflix", "649")
    assert len(_detect(session, user, txns)) == 1

    for txn in txns:
        txn.is_deleted = True
    session.commit()

    assert _refresh(session, user, []) == []


def test_a_user_rejection_is_not_reverted_by_the_next_refresh(
    session: Session,
    user: User,
) -> None:
    """PATCH is_confirmed=false must stick.

    With one boolean and no "rejected" marker, a detector that re-promotes on
    every pass would silently undo the user's decision on a loop.
    """
    txns = _txns(user.id, _monthly_dates(8), "Rent", "19500")
    records = _detect(session, user, txns)
    records[0].is_user_confirmed = False  # what the PATCH endpoint writes
    session.commit()
    # The refresh deletes the now-unconfirmed row and re-derives it, which
    # reuses the primary key; drop the stale instance so the identity map does
    # not hold two objects for one id.
    session.expunge(records[0])

    after = _refresh(session, user, txns)

    assert len(after) == 1
    assert after[0].is_user_confirmed is False


def test_a_confirmed_rows_due_date_follows_the_transactions(
    session: Session,
    user: User,
) -> None:
    """Rent moves from the 20th to the 1st: the bill calendar must follow.

    ``expected_day`` is detector-owned, so the update-in-place branch has to
    refresh it -- a frozen value renders the bill on the wrong day forever.
    """
    session.add(_confirmed(user.id, "Rent", expected_day=20))
    session.commit()

    records = _detect(session, user, _txns(user.id, _monthly_dates(8, day=1), "Rent", "19500"))

    assert len(records) == 1
    assert records[0].is_user_confirmed is True
    assert records[0].expected_day == 1


def test_income_and_expense_patterns_sharing_a_note_do_not_collide(
    session: Session,
    user: User,
) -> None:
    """Two confirmed "Fee" rows, one per type, each keeping its own stats.

    Detection groups on (label, type). Keying the confirmed lookup by label
    alone collapsed both rows into one dict entry, so one absorbed the other's
    amount and the loser froze.
    """
    session.add_all(
        [
            _confirmed(user.id, "Fee", txn_type=TransactionType.EXPENSE),
            _confirmed(user.id, "Fee", txn_type=TransactionType.INCOME),
        ]
    )
    session.commit()
    txns = _txns(user.id, _monthly_dates(8), "Fee", "500")
    txns += _txns(user.id, _monthly_dates(8), "Fee", "900", txn_type=TransactionType.INCOME)

    _detect(session, user, txns)

    by_type = {
        r.transaction_type: r
        for r in session.query(RecurringTransaction).all()
        if r.is_user_confirmed
    }
    assert len(by_type) == 2
    assert by_type[TransactionType.EXPENSE].expected_amount == Decimal("500")
    assert by_type[TransactionType.INCOME].expected_amount == Decimal("900")
    assert by_type[TransactionType.EXPENSE].occurrences_detected == 8
    assert by_type[TransactionType.INCOME].occurrences_detected == 8


def test_habit_rows_are_detected_as_habits_not_bills(session: Session, user: User) -> None:
    """A weekly lunch is periodic but not owed -- kind stays ``habit``."""
    weekly = [datetime(2024, 1, 3, tzinfo=UTC).replace(day=3 + i * 7) for i in range(4)]
    records = _detect(session, user, _txns(user.id, weekly, "Egg Fried Rice", "180"))

    assert len(records) == 1
    assert records[0].pattern_kind == "habit"
    assert records[0].is_user_confirmed is False


def test_user_marked_habit_keeps_its_kind_across_refreshes(session: Session, user: User) -> None:
    """ "Not a bill" in the UI stores kind=habit + confirmed; refresh respects it."""
    session.add(_confirmed(user.id, "Rent"))
    session.commit()
    confirmed = session.query(RecurringTransaction).one()
    confirmed.pattern_kind = "habit"
    session.commit()

    records = _detect(session, user, _txns(user.id, _monthly_dates(8), "Rent", "19500"))

    assert len(records) == 1
    assert records[0].pattern_kind == "habit"

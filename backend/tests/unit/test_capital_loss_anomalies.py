"""Classified realised losses must not drive anomalies or consume budgets.

Three places in ``core/analytics/anomalies.py`` treated a realised trading loss
as spending, and each one produces advice the user cannot act on:

1. ``_detect_high_expense_months`` flagged the loss month as "unusually high
   expenses ... reduce your spending".
2. ``_detect_large_transactions`` flagged the loss row itself. A realised loss is
   typically the single largest EXPENSE row a ledger carries, so once the trader
   has a few of them the detector fires a high-severity alert on every one.
3. ``_update_budget_tracking`` charged the loss against that category's budget,
   persisting ``current_month_spent`` / ``current_month_remaining`` figures that
   the budget UI reads straight out of the table.

All three go through ``_exclude_capital_losses``, so all three are pinned here.
The default-off direction is asserted alongside each: with
``capital_loss_categories`` empty, every detector behaves exactly as it did
before the preference existed.

NOT claimed here: that a loss left in the trailing baseline masks a later real
anomaly. That was the original hypothesis and it is WRONG -- the month detector
baselines on median + MAD, both of which are robust to a single outlier. Measured
on an 11-month window with 1,500-per-month drift, injecting a 400,000 loss moved
the median 47,500 -> 49,000 and left MAD unchanged at 4,500, so a genuine 120,000
month scores z=10.87 clean versus z=10.64 polluted; it trips the 3.5 cutoff
either way. The defect is the false positive, not a masked true positive.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.core.analytics.engine import AnalyticsEngine
from ledger_sync.db.base import Base
from ledger_sync.db.models import (
    Anomaly,
    Budget,
    Transaction,
    TransactionType,
    User,
    UserPreferences,
)

_LOSS_CATEGORY = "Investment Expenses"
_LOSS_SUBCATEGORY = "F&O Loss"
_LOSS_KEY = f"{_LOSS_CATEGORY}::{_LOSS_SUBCATEGORY}"

# The loss lands in the month under test. Big enough to be the largest row in
# the ledger by an order of magnitude, which is what real data looks like.
_LOSS_AMOUNT = "400000"
_ROUTINE_AMOUNT = "20000"


@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    db = factory()
    yield db
    db.close()


def _txn(
    user_id: int,
    amount: str,
    category: str,
    subcategory: str | None,
    when: datetime,
    seq: int,
) -> Transaction:
    return Transaction(
        transaction_id=f"{user_id}-{seq}",
        user_id=user_id,
        date=when,
        amount=Decimal(amount),
        currency="INR",
        type=TransactionType.EXPENSE,
        account="Bank: HDFC" if category != _LOSS_CATEGORY else "Stocks: Groww",
        category=category,
        subcategory=subcategory,
        source_file="t.xlsx",
        last_seen_at=when,
        is_deleted=False,
    )


def _seed(db: Session, *, classify: bool, loss_month: int = 12) -> int:
    """Two flat years of routine spending plus one realised loss.

    A flat baseline is deliberate: it makes the loss the ONLY thing that could
    trip either detector, so a flagged anomaly can only have come from the loss.
    """
    user = User(email="anom@example.com", is_active=True, is_verified=True, hashed_password="")
    db.add(user)
    db.flush()
    db.add(
        UserPreferences(
            user_id=user.id,
            capital_loss_categories=f'["{_LOSS_KEY}"]' if classify else "[]",
        )
    )

    rows: list[Transaction] = []
    seq = 0
    # 11 months of history before the loss month, each with the same routine
    # spend in two categories, so median == the routine total and MAD == 0.
    for month in range(1, loss_month):
        for category, subcategory in (("Food & Dining", "Groceries"), ("Housing", "Rent")):
            seq += 1
            rows.append(
                _txn(
                    user.id,
                    _ROUTINE_AMOUNT,
                    category,
                    subcategory,
                    datetime(2024, month, 5, tzinfo=UTC),
                    seq,
                )
            )
    # The loss month: identical routine spending PLUS the loss.
    for category, subcategory in (("Food & Dining", "Groceries"), ("Housing", "Rent")):
        seq += 1
        rows.append(
            _txn(
                user.id,
                _ROUTINE_AMOUNT,
                category,
                subcategory,
                datetime(2024, loss_month, 5, tzinfo=UTC),
                seq,
            )
        )
    seq += 1
    rows.append(
        _txn(
            user.id,
            _LOSS_AMOUNT,
            _LOSS_CATEGORY,
            _LOSS_SUBCATEGORY,
            datetime(2024, loss_month, 20, tzinfo=UTC),
            seq,
        )
    )
    db.add_all(rows)
    db.commit()
    return user.id


def _detect(db: Session, user_id: int) -> list[Anomaly]:
    AnalyticsEngine(db, user_id=user_id)._detect_anomalies()
    db.commit()
    return db.query(Anomaly).filter(Anomaly.user_id == user_id).all()


# --- monthly + large-transaction detectors -----------------------------------


def test_classified_loss_month_is_not_flagged_as_overspending(session: Session) -> None:
    user_id = _seed(session, classify=True)

    anomalies = _detect(session, user_id)

    # Nothing at all: the routine spend is flat, so with the loss excluded there
    # is no signal left in the series.
    assert anomalies == []


def test_unclassified_loss_month_still_flags_exactly_as_before(session: Session) -> None:
    # Direction 2 of the contract: the shipped state must be unchanged. The loss
    # is still spending to the engine, so it still trips both detectors -- and
    # that is what makes the /data-health prompt worth showing.
    user_id = _seed(session, classify=False)

    anomalies = _detect(session, user_id)

    assert anomalies, "an unclassified loss must keep its pre-preference flags"
    flagged_months = {a.period_key for a in anomalies if a.period_key}
    assert flagged_months == {"2024-12"}


def _add_loss_history(db: Session, user_id: int) -> None:
    """Give the loss taxonomy its own 5-row history so the detector wakes up.

    ``_detect_large_transactions`` needs ``_LARGE_TXN_MIN_HISTORY`` prior rows in
    the SAME category before it will judge one, so a lone loss row is skipped by
    warmup and proves nothing. A trader with a string of losses is the case that
    actually reaches the detector, and it is the realistic one.
    """
    for i in range(5):
        db.add(
            _txn(
                user_id,
                str(50000 + i * 5000),
                _LOSS_CATEGORY,
                _LOSS_SUBCATEGORY,
                datetime(2024, i + 4, 15, tzinfo=UTC),
                seq=9200 + i,
            )
        )
    db.commit()


def test_classified_loss_row_is_not_flagged_as_a_large_transaction(session: Session) -> None:
    # 400,000 against a 60,000 rolling median in the same category: ratio 6.67
    # (above the 5.0 high-severity gate) and log-space z of 14.7, so it clears
    # every gate the detector has. Only the classification keeps it out.
    user_id = _seed(session, classify=True)
    _add_loss_history(session, user_id)

    anomalies = _detect(session, user_id)
    loss_txn_ids = {
        t.transaction_id
        for t in session.query(Transaction).filter(
            Transaction.user_id == user_id, Transaction.category == _LOSS_CATEGORY
        )
    }

    assert loss_txn_ids
    assert not {a.transaction_id for a in anomalies} & loss_txn_ids


def test_unclassified_loss_row_is_still_flagged_as_a_large_transaction(session: Session) -> None:
    # The same ledger with nothing classified: the alert fires, at high severity,
    # which is exactly the noise the /data-health prompt asks the user to fix.
    user_id = _seed(session, classify=False)
    _add_loss_history(session, user_id)

    anomalies = _detect(session, user_id)
    loss_txn_ids = {
        t.transaction_id
        for t in session.query(Transaction).filter(
            Transaction.user_id == user_id, Transaction.category == _LOSS_CATEGORY
        )
    }
    flagged = {a.transaction_id for a in anomalies} & loss_txn_ids

    assert flagged
    assert {a.severity for a in anomalies if a.transaction_id in flagged} == {"high"}


def test_a_real_large_transaction_is_still_flagged(session: Session) -> None:
    # The guard must be surgical: excluding losses must not blind the detector to
    # a genuine outlier in an ordinary category.
    user_id = _seed(session, classify=True)
    _add_loss_history(session, user_id)
    for i in range(5):
        session.add(
            _txn(
                user_id,
                str(3000 + i * 200),
                "Shopping",
                "Electronics",
                datetime(2024, i + 4, 18, tzinfo=UTC),
                seq=9300 + i,
            )
        )
    genuine = _txn(
        user_id,
        "90000",
        "Shopping",
        "Electronics",
        datetime(2024, 11, 8, tzinfo=UTC),
        seq=9400,
    )
    session.add(genuine)
    session.commit()

    anomalies = _detect(session, user_id)

    assert genuine.transaction_id in {a.transaction_id for a in anomalies}


# --- budget tracking ---------------------------------------------------------


def _budget(db: Session, user_id: int, category: str, limit: str) -> Budget:
    budget = Budget(
        user_id=user_id,
        category=category,
        monthly_limit=Decimal(limit),
        is_active=True,
    )
    db.add(budget)
    db.commit()
    return budget


def test_classified_loss_does_not_consume_its_category_budget(session: Session) -> None:
    # A budget on the taxonomy the loss is booked to. current_month_spent is
    # persisted and read straight into the budget UI, so a leak here shows the
    # user a blown budget for money they never spent.
    now = datetime.now(UTC)
    user_id = _seed(session, classify=True, loss_month=now.month)
    session.add(
        _txn(
            user_id,
            _LOSS_AMOUNT,
            _LOSS_CATEGORY,
            _LOSS_SUBCATEGORY,
            now.replace(tzinfo=None),
            seq=9500,
        )
    )
    session.commit()
    budget = _budget(session, user_id, _LOSS_CATEGORY, "5000")

    AnalyticsEngine(session, user_id=user_id)._update_budget_tracking()
    session.commit()
    session.refresh(budget)

    assert budget.current_month_spent == Decimal("0")
    assert budget.current_month_remaining == Decimal("5000")


def test_unclassified_loss_still_consumes_the_budget(session: Session) -> None:
    now = datetime.now(UTC)
    user_id = _seed(session, classify=False, loss_month=now.month)
    session.add(
        _txn(
            user_id,
            _LOSS_AMOUNT,
            _LOSS_CATEGORY,
            _LOSS_SUBCATEGORY,
            now.replace(tzinfo=None),
            seq=9500,
        )
    )
    session.commit()
    budget = _budget(session, user_id, _LOSS_CATEGORY, "5000")

    AnalyticsEngine(session, user_id=user_id)._update_budget_tracking()
    session.commit()
    session.refresh(budget)

    assert budget.current_month_spent == Decimal(_LOSS_AMOUNT)


def test_a_real_expense_budget_is_untouched_by_the_exclusion(session: Session) -> None:
    # The guard must be surgical: only the classified taxonomy is dropped, so a
    # budget on ordinary spending still tracks normally.
    now = datetime.now(UTC)
    user_id = _seed(session, classify=True, loss_month=now.month)
    session.add(
        _txn(
            user_id,
            _ROUTINE_AMOUNT,
            "Food & Dining",
            "Groceries",
            now.replace(tzinfo=None),
            seq=9600,
        )
    )
    session.commit()
    budget = _budget(session, user_id, "Food & Dining", "30000")

    AnalyticsEngine(session, user_id=user_id)._update_budget_tracking()
    session.commit()
    session.refresh(budget)

    assert budget.current_month_spent == Decimal(_ROUTINE_AMOUNT)

"""The IST-day anchors, tested at the 5.5-hour window where UTC disagrees.

Three separate surfaces derived a user-facing day or month from
``datetime.now(UTC)`` while comparing it against values the user reads as
Indian calendar dates. Each was wrong only between IST midnight and 05:30, so
none of them could be caught by a test that reads the real clock -- these
freeze it inside the window instead.

The date arithmetic itself lives in ``test_ledger_clock.py``. What is pinned
here is that each call site reads from that one clock, so the rule cannot drift
back to UTC in one place while staying IST in another.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from ledger_sync.core.analytics.anomalies import AnomaliesMixin
from ledger_sync.core.analytics.net_worth import NetWorthMixin, _ist_day_start
from ledger_sync.db.models import (
    Budget,
    FinancialGoal,
    NetWorthSnapshot,
    Transaction,
    TransactionType,
)

# 01:00 IST on 1 August 2026. In UTC this instant is still 2026-07-31 19:30 --
# the previous day AND the previous month, so it trips both bug classes at once.
JUST_AFTER_IST_MIDNIGHT = datetime(2026, 8, 1, 1, 0)  # noqa: DTZ001 -- naive IST by contract


def _expense(user_id: int, tx_id: str, when: datetime, amount: Decimal) -> Transaction:
    return Transaction(
        transaction_id=tx_id,
        user_id=user_id,
        date=when,
        amount=amount,
        currency="INR",
        type=TransactionType.EXPENSE,
        account="HDFC Bank",
        category="Food",
        note="lunch",
        source_file="test.xlsx",
    )


@pytest.fixture
def frozen_ist_night():
    """Freeze the ledger clock at 01:00 IST on the 1st of the month.

    Patched per consumer module rather than on ``ledger_clock`` itself: each
    call site does ``from ... import ledger_now``, which binds the function
    object at import time, so replacing the attribute on the source module
    would not reach any of them.
    """
    with (
        patch("ledger_sync.core.analytics.net_worth.ledger_now") as net_worth_now,
        patch("ledger_sync.core.analytics.anomalies.ledger_now") as anomalies_now,
        patch("ledger_sync.api.analytics_v2_impl.networth_misc.ledger_today") as goals_today,
    ):
        net_worth_now.return_value = JUST_AFTER_IST_MIDNIGHT
        anomalies_now.return_value = JUST_AFTER_IST_MIDNIGHT
        goals_today.return_value = JUST_AFTER_IST_MIDNIGHT.date()
        yield


def test_net_worth_day_window_opens_on_the_ist_day(frozen_ist_night) -> None:
    """The regression that silently destroyed a history point.

    ``snapshot_date`` is the "as of" date the user reads on the net-worth page,
    and the upsert finds today's row with a day window built from this value. A
    UTC window at 01:00 IST still covers 31 July, so the upsert matched
    YESTERDAY's snapshot and overwrote it instead of inserting today's -- one
    lost day of net-worth history per post-midnight import, plus a change figure
    measured against the wrong base.

    Asserted as the IST date rather than "not the UTC date" so a revert to
    ``datetime.now(UTC)`` fails here with a readable diff.
    """
    assert _ist_day_start() == datetime(2026, 8, 1)  # noqa: DTZ001 -- naive IST by contract


def test_a_snapshot_written_after_ist_midnight_lands_on_the_new_day(
    two_user_client, frozen_ist_night
) -> None:
    """End-to-end companion: the row is keyed to the IST day, so history holds.

    Yesterday's snapshot is seeded first. Under the UTC anchor the day window
    covered 31 July, the upsert found this row, and it was overwritten -- the
    user lost 31 July from their net-worth chart.
    """
    _, session, user_a, _, _ = two_user_client
    yesterday = NetWorthSnapshot(
        user_id=user_a.id,
        snapshot_date=datetime(2026, 7, 31, 10, 0),  # noqa: DTZ001 -- naive IST by contract
        net_worth=Decimal("100000"),
        total_assets=Decimal("100000"),
        total_liabilities=Decimal(0),
        source="upload",
    )
    session.add(yesterday)
    session.commit()

    engine = NetWorthMixin(session, user_a.id)
    totals = dict.fromkeys(
        [
            "cash_and_bank",
            "mutual_funds",
            "stocks",
            "fixed_deposits",
            "ppf_epf",
            "other_assets",
            "credit_card_outstanding",
            "loans_payable",
        ],
        Decimal(0),
    )
    totals["cash_and_bank"] = Decimal("150000")
    engine._upsert_net_worth_snapshot(
        totals,
        Decimal(0),
        Decimal("150000"),
        Decimal(0),
        Decimal("150000"),
        Decimal("50000"),
        50.0,
    )
    session.commit()

    rows = (
        session.query(NetWorthSnapshot)
        .filter(NetWorthSnapshot.user_id == user_a.id)
        .order_by(NetWorthSnapshot.snapshot_date)
        .all()
    )

    # Two days of history, not one overwritten row.
    assert [r.snapshot_date.date().isoformat() for r in rows] == ["2026-07-31", "2026-08-01"]
    assert rows[0].net_worth == Decimal("100000")
    assert rows[1].net_worth == Decimal("150000")


def test_budget_tracking_reads_the_ist_month(two_user_client, frozen_ist_night) -> None:
    """Budget spend is matched with ``fmt_year_month(Transaction.date)``.

    That column holds naive IST, so the key compared against it has to be the
    IST month. Derived from UTC, the first 5.5 hours of every month read the
    month that had just ENDED as "current": the new month's usage stayed at
    zero while last month's spend was reported as current, and a
    BUDGET_EXCEEDED anomaly could be keyed to the closed period.
    """
    _, session, user_a, _, _ = two_user_client
    session.add_all(
        [
            _expense(user_a.id, "jul", datetime(2026, 7, 20), Decimal("9000")),  # noqa: DTZ001
            _expense(user_a.id, "aug", datetime(2026, 8, 1), Decimal("300")),  # noqa: DTZ001
        ]
    )
    session.add(
        Budget(
            user_id=user_a.id,
            category="Food",
            monthly_limit=Decimal("5000"),
            is_active=True,
        )
    )
    session.commit()

    AnomaliesMixin(session, user_a.id)._update_budget_tracking()
    session.commit()

    budget = session.query(Budget).filter(Budget.user_id == user_a.id).one()

    # August's 300, not July's 9000. The UTC anchor reported 9000 -- over a
    # 5000 limit, so it also raised a spurious budget-exceeded anomaly.
    assert budget.current_month_spent == Decimal("300")


def test_goal_months_remaining_counts_from_the_ist_month(two_user_client, frozen_ist_night) -> None:
    """A goal's target date is a ledger date, so the gap is counted in IST.

    Anchored in UTC, a goal created at 01:00 IST on 1 August 2026 against a
    31 December 2026 target counted 5 months from July instead of 4 from
    August, so the monthly contribution came out ~20% too low for the life of
    the goal.
    """
    client, session, _, _, _ = two_user_client

    created = client.post(
        "/api/analytics/v2/goals",
        json={
            "name": "Emergency fund",
            "goal_type": "emergency_fund",
            "target_amount": 400000,
            "target_date": "2026-12-31",
        },
    ).json()

    goal = session.query(FinancialGoal).filter(FinancialGoal.id == created["goal_id"]).one()

    # 400000 / 4 months (August through November). The UTC anchor counted from
    # July, divided by 5, and stored 80000 -- a contribution plan that misses
    # the target by a fifth.
    assert float(goal.monthly_target) == pytest.approx(100000)

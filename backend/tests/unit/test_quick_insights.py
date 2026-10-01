"""Unit tests for the Quick Insights SQL aggregates (parity with quickInsightsData.ts).

Locks in the bits that previously broke on the client:
- net cashback uses a SUBSTRING match on subcategory (the exact-category match
  returned ₹0 for real data), minus "cashback shared" transfers.
- median over absolute expense amounts.
- weekday peak in JS getDay convention (Sun=0).

Rows are stored and read back through ``calculation_service.quick_insights``,
the function the endpoint serves.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.orm import Session

from ledger_sync.db.models import Transaction, TransactionType, User
from ledger_sync.services.calculation_service import quick_insights

Insights = Callable[[list[Transaction]], dict[str, Any]]


@pytest.fixture
def insights(test_db_session: Session, test_user: User) -> Insights:
    """Store *txns* for the test user and return the live Quick Insights response."""

    def run(txns: list[Transaction]) -> dict[str, Any]:
        for txn in txns:
            txn.user_id = test_user.id
        test_db_session.add_all(txns)
        test_db_session.commit()
        return quick_insights(test_db_session, test_user, None, None)

    return run


def _tx(
    tx_type: TransactionType,
    amount: str,
    *,
    date: datetime | None = None,
    category: str = "Cat",
    subcategory: str | None = None,
    to_account: str | None = None,
) -> Transaction:
    d = date or datetime(2024, 1, 15, tzinfo=UTC)
    return Transaction(
        transaction_id=f"{tx_type.value}-{amount}-{d.isoformat()}-{subcategory}",
        user_id=1,
        date=d,
        amount=Decimal(amount),
        currency="INR",
        type=tx_type,
        account="HDFC",
        category=category,
        subcategory=subcategory,
        to_account=to_account,
        source_file="t.xlsx",
        last_seen_at=d,
        is_deleted=False,
    )


def test_net_cashback_substring_match_minus_shared(insights: Insights) -> None:
    txns = [
        # Income cashback under a plural-spelled category, matched by substring.
        _tx(TransactionType.INCOME, "100", subcategory="Credit Card Cashbacks"),
        _tx(TransactionType.INCOME, "50", subcategory="Other Cashbacks"),
        # A refund is NOT cashback -> excluded.
        _tx(TransactionType.INCOME, "999", subcategory="Product Refund"),
        # Shared cashback passed on -> subtracted.
        _tx(TransactionType.TRANSFER, "30", to_account="Cashback Shared"),
    ]
    r = insights(txns)
    assert r["cashback_count"] == 2
    assert r["net_cashback"] == pytest.approx(120.0)  # (100 + 50) - 30


def test_median_and_avg_over_expenses(insights: Insights) -> None:
    txns = [
        _tx(TransactionType.EXPENSE, "10"),
        _tx(TransactionType.EXPENSE, "20"),
        _tx(TransactionType.EXPENSE, "60"),
    ]
    r = insights(txns)
    assert r["median_expense"] == pytest.approx(20.0)
    assert r["avg_expense"] == pytest.approx(30.0)
    assert r["biggest_expense"]["amount"] == pytest.approx(60.0)


def test_peak_day_uses_js_getday_convention(insights: Insights) -> None:
    # 2024-01-07 is a Sunday -> JS getDay 0. Put the biggest spend there.
    txns = [
        _tx(TransactionType.EXPENSE, "500", date=datetime(2024, 1, 7, tzinfo=UTC)),  # Sun
        _tx(TransactionType.EXPENSE, "100", date=datetime(2024, 1, 8, tzinfo=UTC)),  # Mon
    ]
    r = insights(txns)
    assert r["peak_day"] == 0  # Sunday in JS convention
    assert r["peak_day_total"] == pytest.approx(500.0)


def test_weekend_split_and_span(insights: Insights) -> None:
    txns = [
        _tx(TransactionType.EXPENSE, "200", date=datetime(2024, 1, 6, tzinfo=UTC)),  # Sat
        _tx(TransactionType.EXPENSE, "300", date=datetime(2024, 1, 10, tzinfo=UTC)),  # Wed
    ]
    r = insights(txns)
    assert r["weekend_spending"] == pytest.approx(200.0)
    assert r["weekday_spending"] == pytest.approx(300.0)
    assert r["min_date"] == "2024-01-06"
    assert r["max_date"] == "2024-01-10"


def test_empty_is_safe(insights: Insights) -> None:
    r = insights([])
    assert r["net_cashback"] == pytest.approx(0.0)
    assert r["median_expense"] == pytest.approx(0.0)
    assert r["min_date"] is None
    assert r["top_income_source"] is None

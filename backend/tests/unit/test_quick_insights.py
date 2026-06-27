"""Unit tests for the Quick Insights compute (parity with quickInsightsData.ts).

Locks in the bits that previously broke on the client:
- net cashback uses a SUBSTRING match on subcategory (the exact-category match
  returned ₹0 for real data), minus "cashback shared" transfers.
- median over absolute expense amounts.
- weekday peak in JS getDay convention (Sun=0).
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from ledger_sync.api.calculations_helpers import _compute_quick_insights
from ledger_sync.db.models import Transaction, TransactionType


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


def test_net_cashback_substring_match_minus_shared() -> None:
    txns = [
        # Income cashback under a plural-spelled category, matched by substring.
        _tx(TransactionType.INCOME, "100", subcategory="Credit Card Cashbacks"),
        _tx(TransactionType.INCOME, "50", subcategory="Other Cashbacks"),
        # A refund is NOT cashback -> excluded.
        _tx(TransactionType.INCOME, "999", subcategory="Product Refund"),
        # Shared cashback passed on -> subtracted.
        _tx(TransactionType.TRANSFER, "30", to_account="Cashback Shared"),
    ]
    r = _compute_quick_insights(txns)
    assert r["cashback_count"] == 2
    assert r["net_cashback"] == 120.0  # (100 + 50) - 30


def test_median_and_avg_over_expenses() -> None:
    txns = [
        _tx(TransactionType.EXPENSE, "10"),
        _tx(TransactionType.EXPENSE, "20"),
        _tx(TransactionType.EXPENSE, "60"),
    ]
    r = _compute_quick_insights(txns)
    assert r["median_expense"] == 20.0
    assert r["avg_expense"] == 30.0
    assert r["biggest_expense"]["amount"] == 60.0


def test_peak_day_uses_js_getday_convention() -> None:
    # 2024-01-07 is a Sunday -> JS getDay 0. Put the biggest spend there.
    txns = [
        _tx(TransactionType.EXPENSE, "500", date=datetime(2024, 1, 7, tzinfo=UTC)),  # Sun
        _tx(TransactionType.EXPENSE, "100", date=datetime(2024, 1, 8, tzinfo=UTC)),  # Mon
    ]
    r = _compute_quick_insights(txns)
    assert r["peak_day"] == 0  # Sunday in JS convention
    assert r["peak_day_total"] == 500.0


def test_weekend_split_and_span() -> None:
    txns = [
        _tx(TransactionType.EXPENSE, "200", date=datetime(2024, 1, 6, tzinfo=UTC)),  # Sat
        _tx(TransactionType.EXPENSE, "300", date=datetime(2024, 1, 10, tzinfo=UTC)),  # Wed
    ]
    r = _compute_quick_insights(txns)
    assert r["weekend_spending"] == 200.0
    assert r["weekday_spending"] == 300.0
    assert r["min_date"] == "2024-01-06"
    assert r["max_date"] == "2024-01-10"


def test_empty_is_safe() -> None:
    r = _compute_quick_insights([])
    assert r["net_cashback"] == 0
    assert r["median_expense"] == 0.0
    assert r["min_date"] is None
    assert r["top_income_source"] is None

"""Exact monetary aggregates before database-scale rounding or serialization."""

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from ledger_sync.core.analytics.engine import AnalyticsEngine
from ledger_sync.core.analytics.trends import _build_category_trend
from ledger_sync.db.models import CategoryTrend, Transaction, TransactionType, TransferFlow


def _transaction(
    amount, month=1, category="Food", subcategory=None, tx_type=TransactionType.EXPENSE
):
    return Transaction(
        date=datetime(2026, month, 1, tzinfo=UTC),
        amount=Decimal(amount),
        category=category,
        subcategory=subcategory,
        type=tx_type,
        account="Cash",
        from_account="Cash" if tx_type == TransactionType.TRANSFER else None,
        to_account="Bank" if tx_type == TransactionType.TRANSFER else None,
    )


@pytest.mark.parametrize(
    "amounts",
    [
        [Decimal("0.10"), Decimal("0.20")],
        [Decimal("9999999990000.99"), *[Decimal("0.01")] * 1000],
    ],
)
def test_category_aggregates_never_round_trip_through_float(test_db_session, test_user, amounts):
    engine = AnalyticsEngine(test_db_session, user_id=test_user.id)
    transactions = [_transaction(amount) for amount in amounts]
    assert engine._calculate_category_trends(transactions) == 1
    trend = next(row for row in test_db_session.new if isinstance(row, CategoryTrend))
    total = sum(amounts, Decimal(0))
    assert trend.total_amount == total
    assert trend.avg_transaction == total / len(amounts)
    assert trend.max_transaction == max(amounts)
    assert trend.min_transaction == min(amounts)
    assert trend.mom_change == Decimal(0)
    for field in (
        "total_amount",
        "avg_transaction",
        "max_transaction",
        "min_transaction",
        "mom_change",
    ):
        assert isinstance(getattr(trend, field), Decimal)
    assert trend.pct_of_monthly_total == 100.0
    assert isinstance(trend.pct_of_monthly_total, float)


def test_month_changes_and_type_subcategory_totals_are_exact(test_db_session, test_user):
    engine = AnalyticsEngine(test_db_session, user_id=test_user.id)
    transactions = [
        _transaction("0.10", subcategory="Groceries"),
        _transaction("0.20", subcategory="Groceries"),
        _transaction("0.60", subcategory="Groceries", month=2),
        _transaction("0.40", month=2),
        _transaction("0.90", month=2, tx_type=TransactionType.INCOME),
        _transaction("100.00", month=2, tx_type=TransactionType.TRANSFER),
    ]
    assert engine._calculate_category_trends(transactions) == 4
    rows = [row for row in test_db_session.new if isinstance(row, CategoryTrend)]
    february = next(
        row for row in rows if row.period_key == "2026-02" and row.subcategory == "Groceries"
    )
    assert february.total_amount == Decimal("0.60")
    assert february.mom_change == Decimal("0.30")
    assert february.mom_change_pct == 100.0
    assert february.pct_of_monthly_total == 60.0
    assert all(row.user_id == test_user.id for row in rows)


def test_empty_and_zero_category_totals_preserve_decimal_zero():
    trend = _build_category_trend(
        user_id=1,
        period_key="2026-01",
        category="Food",
        subcategory=None,
        txn_type="Expense",
        amounts=[],
        total=Decimal(0),
        monthly_type_total=Decimal(0),
        prev_total=Decimal(0),
    )
    assert trend.avg_transaction == Decimal(0)
    assert trend.min_transaction == Decimal(0)
    assert trend.max_transaction == Decimal(0)
    assert trend.mom_change == Decimal(0)
    assert trend.pct_of_monthly_total == 0.0
    assert trend.mom_change_pct == 0.0


def test_transfer_flow_totals_and_latest_amount_remain_decimal(test_db_session, test_user):
    engine = AnalyticsEngine(test_db_session, user_id=test_user.id)
    transfers = [
        _transaction("0.10", tx_type=TransactionType.TRANSFER),
        _transaction("0.20", month=2, tx_type=TransactionType.TRANSFER),
    ]
    assert engine._calculate_transfer_flows(transfers) == 1
    flow = next(row for row in test_db_session.new if isinstance(row, TransferFlow))
    assert flow.total_amount == Decimal("0.30")
    assert flow.avg_transfer == Decimal("0.15")
    assert flow.last_transfer_amount == Decimal("0.20")
    assert flow.transaction_count == 2
    assert flow.user_id == test_user.id
    assert isinstance(flow.total_amount, Decimal)
    assert isinstance(flow.avg_transfer, Decimal)
    assert isinstance(flow.last_transfer_amount, Decimal)

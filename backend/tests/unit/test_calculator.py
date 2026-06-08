"""Unit tests for the pure calculation functions in ``core/calculator.py``.

These functions operate on in-memory ``Transaction`` ORM objects -- no
database is needed. The focus is boundary behaviour: empty inputs, zero
denominators, year-boundary spans, substring category matching, transfer
netting, and Decimal precision (no float drift in the summation path).

Scalar float results are asserted with ``pytest.approx`` rather than ``==``
to avoid fragile binary-float equality comparisons.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from ledger_sync.core.calculator import (
    calculate_category_concentration,
    calculate_consistency_score,
    calculate_convenience_spending,
    calculate_daily_spending_rate,
    calculate_lifestyle_inflation,
    calculate_monthly_burn_rate,
    calculate_savings_rate,
    calculate_spending_velocity,
    calculate_totals,
    find_best_worst_months,
    group_by_account,
    group_by_category,
    group_by_month,
)
from ledger_sync.db.models import Transaction, TransactionType


def tx(
    amount: float | str,
    type: TransactionType = TransactionType.EXPENSE,
    date: datetime = datetime(2024, 1, 15, tzinfo=UTC),
    category: str = "Food",
    account: str = "Cash",
    from_account: str | None = None,
    to_account: str | None = None,
) -> Transaction:
    """Build an in-memory Transaction for calculator tests."""
    return Transaction(
        amount=Decimal(str(amount)),
        type=type,
        date=date,
        category=category,
        account=account,
        from_account=from_account,
        to_account=to_account,
        currency="INR",
        subcategory="",
        note="",
    )


# ─── calculate_totals ───────────────────────────────────────────────────


def test_totals_empty_list() -> None:
    result = calculate_totals([])
    assert result == {"total_income": 0.0, "total_expenses": 0.0, "net_change": 0.0}


def test_totals_income_and_expense() -> None:
    txns = [
        tx(1000, type=TransactionType.INCOME),
        tx(300, type=TransactionType.EXPENSE),
        tx(200, type=TransactionType.EXPENSE),
    ]
    result = calculate_totals(txns)
    assert result["total_income"] == pytest.approx(1000.0)
    assert result["total_expenses"] == pytest.approx(500.0)
    assert result["net_change"] == pytest.approx(500.0)


def test_totals_ignores_transfers() -> None:
    txns = [
        tx(1000, type=TransactionType.INCOME),
        tx(500, type=TransactionType.TRANSFER, from_account="A", to_account="B"),
    ]
    result = calculate_totals(txns)
    assert result["total_income"] == pytest.approx(1000.0)
    assert result["total_expenses"] == pytest.approx(0.0)


def test_totals_decimal_precision_no_float_drift() -> None:
    """100.50 + 0.25 must sum to exactly 100.75 with no binary-float error."""
    txns = [
        tx(100.50, type=TransactionType.EXPENSE),
        tx(0.25, type=TransactionType.EXPENSE),
    ]
    result = calculate_totals(txns)
    assert result["total_expenses"] == pytest.approx(100.75)


# ─── calculate_savings_rate ─────────────────────────────────────────────


def test_savings_rate_zero_income() -> None:
    assert calculate_savings_rate(0.0, 500.0) == pytest.approx(0.0)


def test_savings_rate_normal() -> None:
    assert calculate_savings_rate(1000.0, 600.0) == pytest.approx(40.0)


def test_savings_rate_negative_when_expenses_exceed_income() -> None:
    assert calculate_savings_rate(1000.0, 1500.0) == pytest.approx(-50.0)


def test_savings_rate_zero_expenses() -> None:
    assert calculate_savings_rate(1000.0, 0.0) == pytest.approx(100.0)


# ─── calculate_daily_spending_rate ──────────────────────────────────────


def test_daily_rate_empty() -> None:
    assert calculate_daily_spending_rate([]) == pytest.approx(0.0)


def test_daily_rate_no_expenses_only_income() -> None:
    assert calculate_daily_spending_rate([tx(1000, type=TransactionType.INCOME)]) == pytest.approx(
        0.0
    )


def test_daily_rate_single_day_span_is_one() -> None:
    """A single expense -> span of 1 day -> rate equals the amount."""
    rate = calculate_daily_spending_rate([tx(100, date=datetime(2024, 1, 1, tzinfo=UTC))])
    assert rate == pytest.approx(100.0)


def test_daily_rate_multi_day_span() -> None:
    """Jan 1 + Jan 10 -> span of 10 days (inclusive), total 200 -> 20/day."""
    txns = [
        tx(100, date=datetime(2024, 1, 1, tzinfo=UTC)),
        tx(100, date=datetime(2024, 1, 10, tzinfo=UTC)),
    ]
    assert calculate_daily_spending_rate(txns) == pytest.approx(20.0)


# ─── calculate_monthly_burn_rate ────────────────────────────────────────


def test_monthly_burn_empty() -> None:
    assert calculate_monthly_burn_rate([]) == pytest.approx(0.0)


def test_monthly_burn_single_month_span_one() -> None:
    """Two expenses in the same month -> span 1 month -> full total."""
    txns = [
        tx(300, date=datetime(2024, 3, 5, tzinfo=UTC)),
        tx(200, date=datetime(2024, 3, 20, tzinfo=UTC)),
    ]
    assert calculate_monthly_burn_rate(txns) == pytest.approx(500.0)


def test_monthly_burn_spans_year_boundary() -> None:
    """Dec 2023 -> Jan 2024 = 2-month span; total 400 -> 200/month."""
    txns = [
        tx(200, date=datetime(2023, 12, 15, tzinfo=UTC)),
        tx(200, date=datetime(2024, 1, 15, tzinfo=UTC)),
    ]
    assert calculate_monthly_burn_rate(txns) == pytest.approx(200.0)


def test_monthly_burn_full_year_span() -> None:
    """Jan -> Dec same year = 12-month span; total 1200 -> 100/month."""
    txns = [
        tx(600, date=datetime(2024, 1, 1, tzinfo=UTC)),
        tx(600, date=datetime(2024, 12, 31, tzinfo=UTC)),
    ]
    assert calculate_monthly_burn_rate(txns) == pytest.approx(100.0)


# ─── group_by_month ─────────────────────────────────────────────────────


def test_group_by_month_empty() -> None:
    assert group_by_month([]) == {}


def test_group_by_month_buckets_income_and_expense() -> None:
    txns = [
        tx(1000, type=TransactionType.INCOME, date=datetime(2024, 1, 5, tzinfo=UTC)),
        tx(300, type=TransactionType.EXPENSE, date=datetime(2024, 1, 20, tzinfo=UTC)),
        tx(150, type=TransactionType.EXPENSE, date=datetime(2024, 2, 2, tzinfo=UTC)),
    ]
    result = group_by_month(txns)
    assert result["2024-01"] == {"income": 1000.0, "expenses": 300.0}
    assert result["2024-02"] == {"income": 0.0, "expenses": 150.0}


def test_group_by_month_ignores_transfers() -> None:
    txns = [tx(500, type=TransactionType.TRANSFER, from_account="A", to_account="B")]
    assert group_by_month(txns) == {}


# ─── group_by_category ──────────────────────────────────────────────────


def test_group_by_category_empty() -> None:
    assert group_by_category([]) == {}


def test_group_by_category_sums_expenses_only() -> None:
    txns = [
        tx(100, category="Food"),
        tx(50, category="Food"),
        tx(200, category="Rent"),
        tx(999, type=TransactionType.INCOME, category="Salary"),
    ]
    result = group_by_category(txns)
    assert result == {"Food": 150.0, "Rent": 200.0}


# ─── group_by_account ───────────────────────────────────────────────────


def test_group_by_account_empty() -> None:
    assert group_by_account([]) == {}


def test_group_by_account_income_adds_expense_subtracts() -> None:
    txns = [
        tx(1000, type=TransactionType.INCOME, account="Bank"),
        tx(300, type=TransactionType.EXPENSE, account="Bank"),
    ]
    assert group_by_account(txns) == {"Bank": 700.0}


def test_group_by_account_transfer_nets_both_sides() -> None:
    """A transfer debits from_account and credits to_account by the amount."""
    txns = [tx(500, type=TransactionType.TRANSFER, from_account="Bank", to_account="Wallet")]
    result = group_by_account(txns)
    assert result == {"Bank": -500.0, "Wallet": 500.0}


def test_group_by_account_transfer_missing_to_account() -> None:
    """Only from_account is touched when to_account is None."""
    txns = [tx(500, type=TransactionType.TRANSFER, from_account="Bank", to_account=None)]
    assert group_by_account(txns) == {"Bank": -500.0}


# ─── calculate_consistency_score ────────────────────────────────────────


def test_consistency_empty_returns_100() -> None:
    assert calculate_consistency_score([]) == pytest.approx(100.0)


def test_consistency_single_value_returns_100() -> None:
    assert calculate_consistency_score([500.0]) == pytest.approx(100.0)


def test_consistency_all_zero_returns_100() -> None:
    assert calculate_consistency_score([0.0, 0.0, 0.0]) == pytest.approx(100.0)


def test_consistency_identical_values_is_perfect() -> None:
    """Zero variance -> CV 0 -> score 100."""
    assert calculate_consistency_score([500.0, 500.0, 500.0]) == pytest.approx(100.0)


def test_consistency_high_variance_lowers_score() -> None:
    score = calculate_consistency_score([100.0, 900.0])
    assert 0.0 <= score < 100.0


# ─── calculate_lifestyle_inflation ──────────────────────────────────────


def test_lifestyle_inflation_fewer_than_six_expenses() -> None:
    txns = [tx(100, date=datetime(2024, 1, i + 1, tzinfo=UTC)) for i in range(5)]
    assert calculate_lifestyle_inflation(txns) == pytest.approx(0.0)


def test_lifestyle_inflation_genuine_increase() -> None:
    """First-3-months avg 100/mo vs last-3-months avg 200/mo -> +100%.

    3 early expenses of 100 each (Jan), 3 late expenses of 200 each (Dec):
    avg_first = 300/3 = 100, avg_last = 600/3 = 200 -> (200-100)/100*100 = 100.
    """
    early = [tx(100, date=datetime(2024, 1, d, tzinfo=UTC)) for d in (1, 2, 3)]
    late = [tx(200, date=datetime(2024, 12, d, tzinfo=UTC)) for d in (1, 2, 3)]
    assert calculate_lifestyle_inflation(early + late) == pytest.approx(100.0)


def test_lifestyle_inflation_avg_first_zero_returns_0() -> None:
    """If the first window sums to zero, guard returns 0.0 (no div-by-zero).

    Zero-amount early expenses + non-zero late ones, all >= 6 total.
    """
    early = [tx(0, date=datetime(2024, 1, d, tzinfo=UTC)) for d in (1, 2, 3)]
    late = [tx(200, date=datetime(2024, 12, d, tzinfo=UTC)) for d in (1, 2, 3)]
    assert calculate_lifestyle_inflation(early + late) == pytest.approx(0.0)


# ─── calculate_category_concentration ───────────────────────────────────


def test_concentration_empty_dict() -> None:
    assert calculate_category_concentration({}) == pytest.approx(0.0)


def test_concentration_total_zero() -> None:
    assert calculate_category_concentration({"Food": 0.0, "Rent": 0.0}) == pytest.approx(0.0)


def test_concentration_single_category_is_100() -> None:
    assert calculate_category_concentration({"Food": 500.0}) == pytest.approx(100.0)


def test_concentration_top_share() -> None:
    """Top category 750 of 1000 total -> 75%."""
    assert calculate_category_concentration({"Food": 750.0, "Rent": 250.0}) == pytest.approx(75.0)


# ─── calculate_spending_velocity ────────────────────────────────────────


def test_velocity_empty() -> None:
    result = calculate_spending_velocity([])
    assert result == {"recent_daily": 0.0, "historical_daily": 0.0, "velocity_ratio": 0.0}


def test_velocity_no_historical_ratio_zero() -> None:
    """All expenses within the recent window -> no historical -> ratio 0.0."""
    txns = [
        tx(300, date=datetime(2024, 6, 1, tzinfo=UTC)),
        tx(300, date=datetime(2024, 6, 20, tzinfo=UTC)),
    ]
    result = calculate_spending_velocity(txns, recent_days=30)
    assert result["historical_daily"] == pytest.approx(0.0)
    assert result["velocity_ratio"] == pytest.approx(0.0)
    assert result["recent_daily"] == pytest.approx(20.0)  # (300+300)/30


def test_velocity_recent_and_historical_split() -> None:
    """One old expense (historical) + one recent expense produce a ratio.

    today = max date = 2024-06-30. recent_cutoff = 2024-05-31.
    Historical: a single expense on 2024-01-01 -> hist span 1 day -> 600/day.
    Recent: a single expense on 2024-06-30 -> 600/30 = 20/day.
    ratio = 20 / 600.
    """
    txns = [
        tx(600, date=datetime(2024, 1, 1, tzinfo=UTC)),
        tx(600, date=datetime(2024, 6, 30, tzinfo=UTC)),
    ]
    result = calculate_spending_velocity(txns, recent_days=30)
    assert result["recent_daily"] == pytest.approx(20.0)
    assert result["historical_daily"] == pytest.approx(600.0)
    assert result["velocity_ratio"] == pytest.approx(20.0 / 600.0)


# ─── find_best_worst_months ─────────────────────────────────────────────


def test_best_worst_empty() -> None:
    assert find_best_worst_months({}) == {"best_month": None, "worst_month": None}


def test_best_worst_single_month_is_both() -> None:
    data = {"2024-01": {"income": 1000.0, "expenses": 400.0}}
    result = find_best_worst_months(data)
    assert result["best_month"]["month"] == "2024-01"
    assert result["worst_month"]["month"] == "2024-01"
    assert result["best_month"]["surplus"] == pytest.approx(600.0)


def test_best_worst_distinct_months() -> None:
    data = {
        "2024-01": {"income": 1000.0, "expenses": 200.0},  # surplus 800 (best)
        "2024-02": {"income": 500.0, "expenses": 900.0},  # surplus -400 (worst)
    }
    result = find_best_worst_months(data)
    assert result["best_month"]["month"] == "2024-01"
    assert result["worst_month"]["month"] == "2024-02"


def test_best_worst_ties_do_not_crash() -> None:
    """Equal surpluses: max/min still return valid entries (no exception)."""
    data = {
        "2024-01": {"income": 1000.0, "expenses": 500.0},
        "2024-02": {"income": 800.0, "expenses": 300.0},
    }
    result = find_best_worst_months(data)
    assert result["best_month"]["surplus"] == pytest.approx(500.0)
    assert result["worst_month"]["surplus"] == pytest.approx(500.0)


# ─── calculate_convenience_spending ─────────────────────────────────────


def test_convenience_empty() -> None:
    result = calculate_convenience_spending([])
    assert result == {"convenience_amount": 0.0, "total_amount": 0.0, "convenience_pct": 0.0}


def test_convenience_substring_match() -> None:
    """'Food & Dining' matches the 'dining' token via substring."""
    txns = [
        tx(300, category="Food & Dining"),
        tx(700, category="Rent"),
    ]
    result = calculate_convenience_spending(txns)
    assert result["convenience_amount"] == pytest.approx(300.0)
    assert result["total_amount"] == pytest.approx(1000.0)
    assert result["convenience_pct"] == pytest.approx(30.0)


def test_convenience_total_zero_pct_is_zero() -> None:
    """Zero-amount expenses -> total 0 -> guard returns pct 0.0."""
    txns = [tx(0, category="Shopping"), tx(0, category="Rent")]
    result = calculate_convenience_spending(txns)
    assert result["total_amount"] == pytest.approx(0.0)
    assert result["convenience_pct"] == pytest.approx(0.0)


def test_convenience_no_matching_category() -> None:
    txns = [tx(500, category="Rent"), tx(500, category="Utilities")]
    result = calculate_convenience_spending(txns)
    assert result["convenience_amount"] == pytest.approx(0.0)
    assert result["total_amount"] == pytest.approx(1000.0)
    assert result["convenience_pct"] == pytest.approx(0.0)

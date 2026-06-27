"""Unit tests for the income-analysis compute (parity with IncomeAnalysisPage).

Locks in: total, by-category, 3-month rolling avg, cashback matching against a
caller-supplied non-taxable classification list (case-insensitive exact
Category::Subcategory match), and growth rate.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from ledger_sync.api.calculations_helpers import _compute_income_analysis
from ledger_sync.db.models import Transaction, TransactionType


def _inc(
    amount: str,
    *,
    date: datetime,
    category: str = "Employment Income",
    subcategory: str | None = None,
) -> Transaction:
    return Transaction(
        transaction_id=f"{amount}-{date.isoformat()}-{subcategory}",
        user_id=1,
        date=date,
        amount=Decimal(amount),
        currency="INR",
        type=TransactionType.INCOME,
        account="HDFC",
        category=category,
        subcategory=subcategory,
        source_file="t.xlsx",
        last_seen_at=date,
        is_deleted=False,
    )


def test_totals_and_category_breakdown() -> None:
    txns = [
        _inc("1000", date=datetime(2024, 1, 5, tzinfo=UTC)),
        _inc("500", date=datetime(2024, 1, 6, tzinfo=UTC), category="Investment Income"),
    ]
    r = _compute_income_analysis(txns, [])
    assert r["total_income"] == 1500.0
    assert r["category_breakdown"]["Employment Income"] == 1000.0
    assert r["category_breakdown"]["Investment Income"] == 500.0


def test_cashback_matches_classification_case_insensitive() -> None:
    txns = [
        _inc(
            "100",
            date=datetime(2024, 1, 5, tzinfo=UTC),
            category="Refund & Cashbacks",
            subcategory="Credit Card Cashbacks",
        ),
        _inc("900", date=datetime(2024, 1, 6, tzinfo=UTC)),  # salary, not cashback
    ]
    # List uses different case -> still matches.
    r = _compute_income_analysis(txns, ["refund & cashbacks::credit card cashbacks"])
    assert r["cashbacks_total"] == 100.0


def test_monthly_rolling_average() -> None:
    txns = [
        _inc("100", date=datetime(2024, 1, 5, tzinfo=UTC)),
        _inc("200", date=datetime(2024, 2, 5, tzinfo=UTC)),
        _inc("300", date=datetime(2024, 3, 5, tzinfo=UTC)),
    ]
    r = _compute_income_analysis(txns, [])
    md = r["monthly_data"]
    assert [m["income"] for m in md] == [100.0, 200.0, 300.0]
    # 3-month trailing average: Jan=100, Feb=(100+200)/2=150, Mar=(100+200+300)/3=200
    assert [round(m["income_avg_3m"]) for m in md] == [100, 150, 200]
    # growth: (300-100)/100*100 = 200%
    assert round(r["growth_rate"]) == 200
    assert r["peak_income"] == 300.0


def test_empty_is_safe() -> None:
    r = _compute_income_analysis([], [])
    assert r["total_income"] == 0
    assert r["cashbacks_total"] == 0
    assert r["monthly_data"] == []
    assert r["growth_rate"] == 0.0

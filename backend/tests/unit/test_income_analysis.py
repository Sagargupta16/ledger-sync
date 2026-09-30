"""Unit tests for the income-analysis aggregates (parity with IncomeAnalysisPage).

Locks in: total, by-category, 3-month rolling avg, cashback (income whose
subcategory says cashback), the caller-supplied non-taxable classification
list (case-insensitive exact Category::Subcategory match, ``non_taxable_total``),
and growth rate.

Rows are stored and read back through ``calculation_service.income_analysis``,
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
from ledger_sync.services.calculation_service import income_analysis

Analysis = Callable[[list[Transaction], list[str]], dict[str, Any]]


@pytest.fixture
def analysis(test_db_session: Session, test_user: User) -> Analysis:
    """Store *txns* for the test user and return the live income-analysis response."""

    def run(txns: list[Transaction], cashback_categories: list[str]) -> dict[str, Any]:
        for txn in txns:
            txn.user_id = test_user.id
        test_db_session.add_all(txns)
        test_db_session.commit()
        return income_analysis(
            test_db_session,
            test_user,
            start_date=None,
            end_date=None,
            cashback_categories=cashback_categories,
            category=None,
        )

    return run


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


def test_totals_and_category_breakdown(analysis: Analysis) -> None:
    txns = [
        _inc("1000", date=datetime(2024, 1, 5, tzinfo=UTC)),
        _inc("500", date=datetime(2024, 1, 6, tzinfo=UTC), category="Investment Income"),
    ]
    r = analysis(txns, [])
    assert r["total_income"] == pytest.approx(1500.0)
    assert r["category_breakdown"]["Employment Income"] == pytest.approx(1000.0)
    assert r["category_breakdown"]["Investment Income"] == pytest.approx(500.0)


def test_cashback_matches_classification_case_insensitive(analysis: Analysis) -> None:
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
    r = analysis(txns, ["refund & cashbacks::credit card cashbacks"])
    assert r["non_taxable_total"] == pytest.approx(100.0)
    assert r["cashbacks_total"] == pytest.approx(100.0)


def test_monthly_rolling_average(analysis: Analysis) -> None:
    txns = [
        _inc("100", date=datetime(2024, 1, 5, tzinfo=UTC)),
        _inc("200", date=datetime(2024, 2, 5, tzinfo=UTC)),
        _inc("300", date=datetime(2024, 3, 5, tzinfo=UTC)),
    ]
    r = analysis(txns, [])
    md = r["monthly_data"]
    assert [m["income"] for m in md] == pytest.approx([100.0, 200.0, 300.0])
    # Jan and Feb have no full 3-month window behind them, so they abstain rather
    # than dividing a short window by its own length: this used to report Jan=100
    # (one month verbatim) and Feb=150 (a 2-month mean) under a "3m avg" legend.
    # Only Mar has three months: (100+200+300)/3 = 200.
    assert [m["income_avg_3m"] for m in md[:2]] == [None, None]
    assert md[2]["income_avg_3m"] == pytest.approx(200.0)
    # growth: (300-100)/100*100 = 200%
    assert round(r["growth_rate"]) == 200
    assert r["peak_income"] == pytest.approx(300.0)


def test_rolling_average_needs_a_full_window(analysis: Analysis) -> None:
    """A window shorter than ``INCOME_ROLLING_MONTHS`` yields no average at all."""
    txns = [
        _inc("100", date=datetime(2024, 1, 5, tzinfo=UTC)),
        _inc("200", date=datetime(2024, 2, 5, tzinfo=UTC)),
    ]
    r = analysis(txns, [])
    assert [m["income_avg_3m"] for m in r["monthly_data"]] == [None, None]


def test_rolling_average_window_slides_and_drops_the_oldest_month(analysis: Analysis) -> None:
    """Once the window is full it stays exactly ``INCOME_ROLLING_MONTHS`` wide."""
    txns = [
        _inc("100", date=datetime(2024, 1, 5, tzinfo=UTC)),
        _inc("200", date=datetime(2024, 2, 5, tzinfo=UTC)),
        _inc("300", date=datetime(2024, 3, 5, tzinfo=UTC)),
        _inc("600", date=datetime(2024, 4, 5, tzinfo=UTC)),
    ]
    md = analysis(txns, [])["monthly_data"]
    # Apr = (200+300+600)/3 = 366.67 -- January must have fallen out of it.
    assert md[3]["income_avg_3m"] == pytest.approx(1100.0 / 3)


def test_rolling_average_survives_a_gap_month(analysis: Analysis) -> None:
    """Months are positional: absent months are not zero-filled.

    The series only holds months that have income, so a March with no income
    makes April's window Jan/Feb/Apr. Documented rather than desirable -- what
    matters is that it stays a 3-element window, never a short one.
    """
    txns = [
        _inc("100", date=datetime(2024, 1, 5, tzinfo=UTC)),
        _inc("200", date=datetime(2024, 2, 5, tzinfo=UTC)),
        _inc("300", date=datetime(2024, 4, 5, tzinfo=UTC)),
    ]
    md = analysis(txns, [])["monthly_data"]
    assert [m["month"] for m in md] == ["2024-01", "2024-02", "2024-04"]
    assert md[2]["income_avg_3m"] == pytest.approx(200.0)


def test_empty_is_safe(analysis: Analysis) -> None:
    r = analysis([], [])
    assert r["total_income"] == pytest.approx(0.0)
    assert r["cashbacks_total"] == pytest.approx(0.0)
    assert r["monthly_data"] == []
    assert r["growth_rate"] == pytest.approx(0.0)

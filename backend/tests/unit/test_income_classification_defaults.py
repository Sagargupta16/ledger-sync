"""Regression tests for the income-classification DEFAULT category keys.

``ClassificationMixin`` matches ``f"{category}::{subcategory}"`` with a plain
``in`` against the preference lists on ``AnalyticsEngineBase``. That is an
EXACT-MATCH lookup, so a default key that no transaction carries contributes
zero SILENTLY -- nothing raises, a KPI just reads 0.

Which list feeds which consumer matters, so the assertions below are honest
about their blast radius:

* ``taxable_income_categories`` and ``investment_returns_categories`` are read
  by ``ClassificationMixin`` (``_is_taxable_income`` / ``_is_salary_income`` /
  ``_is_bonus_income`` / ``_is_investment_income``), which drives the
  salary / bonus / investment splits in ``monthly_summaries`` and the FY
  summaries. A drifted key here moves real money between buckets.
* ``non_taxable_income_categories`` has NO consumer inside
  ``ClassificationMixin``. Its money-affecting path is
  ``api/calculations_helpers.py::_compute_income_analysis``, which matches the
  list the CLIENT forwards as ``cashback_categories`` -- so these keys matter
  because the frontend store and ``POST /api/preferences/reset`` seed the same
  spellings, not because the mixin reads them.
* ``other_income_categories`` currently has no consumer at all. It is asserted
  only for shape (exact-match form, no cross-bucket overlap).

Every pair asserted below is a (category, subcategory) combination that occurs
in a real exported ledger, verified with::

    sqlite> SELECT category, subcategory, COUNT(*), ROUND(SUM(amount),2)
            FROM transactions
            WHERE type='INCOME' AND is_deleted=0   -- the analytics basis
            GROUP BY 1,2;

``is_deleted=0`` is load-bearing: ``_user_transaction_query`` filters
soft-deleted rows, so an aggregate measured without it overstates several of
these keys. Absolute counts and amounts stay out of tracked source (this repo is
public); the measurements live in the untracked notes under
``.claude/docs/studies/``.

The shipped defaults used "Refund & Cashbacks" (SINGULAR), "Deposits Return",
"Stock Market Profits" and "F&O Income" -- each matching 0 rows.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.core.analytics.classification import ClassificationMixin
from ledger_sync.db.models import Transaction, TransactionType


class _Defaults(ClassificationMixin):
    """Read the shipped defaults without a DB session.

    ``AnalyticsEngineBase.__init__`` queries for preferences, so it is bypassed;
    ``_preferences = None`` is exactly the "no stored preferences" branch every
    default in ``base.py`` guards.
    """

    def __init__(self) -> None:
        self._preferences = None
        self.user_id = 1


def _income(category: str, subcategory: str) -> Transaction:
    date = datetime(2026, 3, 15, tzinfo=UTC)
    return Transaction(
        transaction_id=f"{category}::{subcategory}",
        user_id=1,
        date=date,
        amount=Decimal("1000"),
        currency="INR",
        type=TransactionType.INCOME,
        account="Bank: SBI",
        category=category,
        subcategory=subcategory,
        source_file="t.xlsx",
        last_seen_at=date,
        is_deleted=False,
    )


@pytest.fixture
def defaults() -> _Defaults:
    return _Defaults()


REAL_CASHBACK_KEYS = [
    ("Refunds & Cashbacks", "Credit Card Cashbacks"),
    ("Refunds & Cashbacks", "Other Cashbacks"),
    ("Refunds & Cashbacks", "Product/Service Refunds"),
    ("Refunds & Cashbacks", "Deposit Return"),
]


@pytest.mark.parametrize(("category", "subcategory"), REAL_CASHBACK_KEYS)
def test_real_plural_cashback_keys_are_non_taxable(
    defaults: _Defaults,
    category: str,
    subcategory: str,
) -> None:
    """Every real cashback/refund spelling must be in the non-taxable defaults."""
    assert f"{category}::{subcategory}" in defaults.non_taxable_income_categories


@pytest.mark.parametrize(("category", "subcategory"), REAL_CASHBACK_KEYS)
def test_real_plural_cashback_is_never_taxable(
    defaults: _Defaults,
    category: str,
    subcategory: str,
) -> None:
    """Cashback is not income tax base; the drifted key must not push it there."""
    txn = _income(category, subcategory)
    assert defaults._is_taxable_income(txn) is False
    assert defaults._is_salary_income(txn) is False
    assert defaults._is_bonus_income(txn) is False


def test_singular_cashback_spelling_still_matches(defaults: _Defaults) -> None:
    """Back-compat: an existing user on the singular name must not regress."""
    assert "Refund & Cashbacks::Credit Card Cashbacks" in (defaults.non_taxable_income_categories)


@pytest.mark.parametrize(
    ("category", "subcategory"),
    [
        ("Investment Income", "Stock Market Profit"),
        ("Investment Income", "F&O Profits"),
        ("Investment Income", "Dividends"),
        ("Investment Income", "Interest"),
    ],
)
def test_real_investment_income_keys_classify(
    defaults: _Defaults,
    category: str,
    subcategory: str,
) -> None:
    """Realised market profit was falling out of investment returns entirely.

    The shipped keys were "Stock Market Profits" and "F&O Income"; the data
    carries "Stock Market Profit" and "F&O Profits", so ``_is_investment_income``
    returned False for every realised-profit row and the amount landed in
    ``other_income`` instead.
    """
    assert defaults._is_investment_income(_income(category, subcategory)) is True


@pytest.mark.parametrize(
    ("category", "subcategory", "is_salary", "is_bonus"),
    [
        ("Employment Income", "Salary", True, False),
        ("Employment Income", "Stipend", True, False),
        ("Employment Income", "Bonuses", False, True),
        ("Employment Income", "RSUs", False, True),
    ],
)
def test_real_employment_keys_stay_taxable(
    defaults: _Defaults,
    category: str,
    subcategory: str,
    is_salary: bool,
    is_bonus: bool,
) -> None:
    txn = _income(category, subcategory)
    assert defaults._is_taxable_income(txn) is True
    assert defaults._is_salary_income(txn) is is_salary
    assert defaults._is_bonus_income(txn) is is_bonus


def test_every_default_key_is_exact_match_shaped(defaults: _Defaults) -> None:
    """A stray space would break the exact-match lookup just as silently."""
    all_keys = [
        *defaults.taxable_income_categories,
        *defaults.investment_returns_categories,
        *defaults.non_taxable_income_categories,
        *defaults.other_income_categories,
    ]
    assert all_keys
    for key in all_keys:
        assert "::" in key
        assert key == key.strip()


def test_classification_buckets_do_not_overlap(defaults: _Defaults) -> None:
    """Adding the real spellings must not double-count a key across buckets."""
    buckets = [
        set(defaults.taxable_income_categories),
        set(defaults.investment_returns_categories),
        set(defaults.non_taxable_income_categories),
        set(defaults.other_income_categories),
    ]
    for i, left in enumerate(buckets):
        for right in buckets[i + 1 :]:
            assert not (left & right)


def test_base_still_falls_back_to_defaults_when_preferences_absent() -> None:
    """Guard the branch these defaults live on, so the test can't go vacuous."""
    engine = _Defaults()
    assert isinstance(engine, AnalyticsEngineBase)
    assert engine._preferences is None
    assert engine.non_taxable_income_categories

"""Transaction classification mixin.

Pure predicates that answer "is this transaction a kind of X?" against the
preference-driven category lists maintained by ``AnalyticsEngineBase``.
"""

from __future__ import annotations

from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.db.models import Transaction


class ClassificationMixin(AnalyticsEngineBase):
    """Mixin: category-based predicates.

    Inherits from ``AnalyticsEngineBase`` for typing only -- composition
    happens in ``engine.AnalyticsEngine`` via MRO, not via this inheritance.
    """

    def _is_taxable_income(self, txn: Transaction) -> bool:
        """Check if transaction is taxable income based on preferences."""
        item = f"{txn.category}::{txn.subcategory}"
        return item in self.taxable_income_categories

    def _is_salary_income(self, txn: Transaction) -> bool:
        """Check if transaction is salary income (subset of taxable)."""
        item = f"{txn.category}::{txn.subcategory}"
        salary_items = [
            "Employment Income::Salary",
            "Employment Income::Stipend",
        ]
        return item in salary_items

    def _is_bonus_income(self, txn: Transaction) -> bool:
        """Check if transaction is bonus income (subset of taxable)."""
        item = f"{txn.category}::{txn.subcategory}"
        bonus_items = [
            "Employment Income::Bonuses",
            "Employment Income::RSUs",
        ]
        return item in bonus_items

    def _is_investment_income(self, txn: Transaction) -> bool:
        """Check if transaction is investment income based on preferences."""
        item = f"{txn.category}::{txn.subcategory}"
        return item in self.investment_returns_categories

    def _is_investment_account(self, account_name: str | None) -> bool:
        """Check if account name matches an investment-account pattern."""
        if not account_name:
            return False
        return any(inv in account_name for inv in self.investment_account_patterns)

    def _get_investment_type(self, account_name: str | None) -> str | None:
        """Return the investment type tag for an account (e.g. ``'stocks'``)."""
        if not account_name:
            return None
        for pattern, inv_type in self.investment_account_patterns.items():
            if pattern in account_name:
                return inv_type
        return None

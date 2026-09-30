"""Transaction classification mixin.

Pure predicates that answer "is this transaction a kind of X?" against the
preference-driven category lists maintained by ``AnalyticsEngineBase``. The
matching rules themselves live in ``core.metric_rules`` so the rollups and the
API endpoints share one definition of each figure.
"""

from __future__ import annotations

from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.core.expense_class import classification_key, is_capital_loss
from ledger_sync.core.metric_rules import (
    classify_employment_income,
    income_keys,
    investment_account_names,
    is_investment_account,
    looks_like_investment_income,
    normalize_account,
)
from ledger_sync.db.models import Transaction


class ClassificationMixin(AnalyticsEngineBase):
    """Mixin: category-based predicates.

    Inherits from ``AnalyticsEngineBase`` for typing only -- composition
    happens in ``engine.AnalyticsEngine`` via MRO, not via this inheritance.
    """

    def _is_taxable_income(self, txn: Transaction) -> bool:
        """Taxable income: the row's key is in the taxable list, case-insensitively."""
        key = classification_key(txn.category, txn.subcategory)
        return key in income_keys(self.taxable_income_categories)

    def _is_salary_income(self, txn: Transaction) -> bool:
        """Salary income: a taxable item that ``classify_employment_income`` calls salary.

        Preference-driven (subset of ``taxable_income_categories``) so users
        whose category names differ from the default schema still classify.
        The salary / stipend keywords are matched at word boundaries on the
        subcategory, then the category -- the Tax page's rule too -- so
        "Employment Income::Monthly Salary" is salary.
        """
        return self._is_taxable_income(txn) and (
            classify_employment_income(txn.category, txn.subcategory) == "salary"
        )

    def _is_bonus_income(self, txn: Transaction) -> bool:
        """Bonus income: a taxable item whose keywords say bonus or RSU."""
        return self._is_taxable_income(txn) and (
            classify_employment_income(txn.category, txn.subcategory) == "bonus"
        )

    def _is_investment_income(self, txn: Transaction) -> bool:
        """Investment income: the user's list, else the default keywords.

        A configured ``investment_returns_categories`` list is honoured exactly
        (case-insensitive whole key). When it resolves to empty or to the
        shipped defaults -- i.e. the user has not chosen their own -- the
        generic keywords (interest, dividends, capital gains, mutual fund gains,
        returns) also count, so a taxonomy that is not the shipped template
        still reports its investment returns. A row the user filed under
        another income list is never re-claimed by a keyword.
        """
        key = classification_key(txn.category, txn.subcategory)
        if key in income_keys(self.investment_returns_categories):
            return True
        if not self.investment_returns_categories_is_default:
            return False
        if key in self._other_income_list_keys():
            return False
        return looks_like_investment_income(txn.category, txn.subcategory)

    def _other_income_list_keys(self) -> frozenset[str]:
        """Keys the user classified as taxable, non-taxable or other income."""
        return income_keys(
            [
                *self.taxable_income_categories,
                *self.non_taxable_income_categories,
                *self.other_income_categories,
            ]
        )

    def _is_capital_loss(self, txn: Transaction) -> bool:
        """Is this EXPENSE row a realised investment loss the user classified?

        A realised loss has to be booked as an ``EXPENSE`` for a cashbook's cash
        column to balance, but it bought no goods or services -- it is a negative
        investment return. Summed as spending it inflates expense totals, the
        essential/discretionary split and the anomaly baseline at once.

        False for every row until the user populates
        ``capital_loss_categories``, so no historical number moves on its own.
        Detection (``looks_like_capital_loss``) only suggests candidates; it is
        never consulted here.
        """
        return is_capital_loss(txn.category, txn.subcategory, self.capital_loss_keys)

    def _is_investment_account(self, account_name: str | None) -> bool:
        """The one investment-account rule (``core.metric_rules``).

        Mapped accounts match on their exact name, case-insensitively; with no
        mapping the default keyword list applies.
        """
        return is_investment_account(
            account_name, investment_account_names(self.investment_account_patterns)
        )

    def _get_investment_type(self, account_name: str | None) -> str | None:
        """Return the mapped investment type for an account (e.g. ``'stocks'``).

        Exact, case-insensitive account-name match -- the same rule as
        ``_is_investment_account``. Keyword-fallback accounts have no mapped
        type, so they return ``None``.
        """
        name = normalize_account(account_name)
        if not name:
            return None
        for account, inv_type in self.investment_account_patterns.items():
            if normalize_account(account) == name:
                return inv_type
        return None

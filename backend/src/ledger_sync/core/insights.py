"""Insight generation engine - creates written, data-derived insights.

Two cross-cutting concerns are resolved ONCE here and threaded into every
generator, rather than being re-decided at each of the twenty-odd decision
sites in ``insight_generators``:

1. **The display currency symbol.** Resolved from the user's preferences the
   same way ``AnalyticsBase._currency_symbol`` does. Every amount in every
   insight string reads this one value, so a user on USD cannot be shown a
   rupee-prefixed figure. Nine f-strings used to hardcode the symbol.
2. **The reference date** for the completed-month split. Injectable so the
   behaviour on the 3rd of a month is testable, defaulting to the shared IST
   ``ledger_clock`` rather than a bare ``date.today()``.

Both are optional, so ``InsightEngine()`` with no arguments still works and
still behaves exactly as before for an INR user.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

from ledger_sync.core import calculator
from ledger_sync.core.insight_generators import category_insights, spending_insights
from ledger_sync.core.insight_generators_time import behavioral_insights, temporal_insights
from ledger_sync.core.insight_rules import DEFAULT_CURRENCY_SYMBOL
from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.db.models import TransactionType

if TYPE_CHECKING:
    from datetime import date

    from ledger_sync.db.models import Transaction


@runtime_checkable
class SupportsCurrencySymbol(Protocol):
    """The only part of ``UserPreferences`` this engine reads.

    Declared as a read-only property, not a mutable attribute. A mutable
    protocol member is invariant, so ``UserPreferences`` -- whose column is
    ``Mapped[str]``, narrower than ``str | None`` -- would NOT satisfy a
    ``currency_symbol: str | None`` attribute and the real router call would
    fail type-checking. Read-only members are covariant, which is what an
    engine that only ever reads the value should ask for.
    """

    @property
    def currency_symbol(self) -> str | None:
        """The user's configured display symbol, if any."""
        ...


def resolve_currency_symbol(preferences: SupportsCurrencySymbol | None) -> str:
    """The user's display symbol, or the shipped default.

    Mirrors ``AnalyticsBase._currency_symbol``: a preferences row that exists
    but carries an empty symbol still falls back, since an empty prefix would
    render bare digits with no currency at all.
    """
    if preferences is not None and hasattr(preferences, "currency_symbol"):
        return preferences.currency_symbol or DEFAULT_CURRENCY_SYMBOL
    return DEFAULT_CURRENCY_SYMBOL


class InsightEngine:
    """Generate written insights from transaction data."""

    def __init__(
        self,
        preferences: SupportsCurrencySymbol | None = None,
        *,
        today: date | None = None,
    ) -> None:
        """Bind the display currency and the reference date for this run.

        Args:
            preferences: The user's preferences row. ``None`` -- the shape the
                pre-existing caller uses -- keeps the shipped default symbol.
            today: Reference date for deciding which month is still in
                progress. Defaults to the IST ledger clock.

        """
        self._symbol = resolve_currency_symbol(preferences)
        self._today = today if today is not None else ledger_today()

    def generate_all_insights(self, transactions: list[Transaction]) -> list[dict[str, str]]:
        """Generate all available insights.

        Args:
            transactions: List of transactions

        Returns:
            List of insight dictionaries with title, description, severity

        """
        insights: list[dict[str, str]] = []
        for generate in (
            spending_insights,
            category_insights,
            temporal_insights,
            behavioral_insights,
        ):
            insights.extend(generate(transactions, self._symbol, self._today))
        return insights

    @staticmethod
    def generate_monthly_summary(transactions: list[Transaction], month: str) -> dict[str, Any]:
        """Generate summary insights for a specific month.

        Args:
            transactions: Filtered transactions for the month
            month: Month string (YYYY-MM)

        Returns:
            Dictionary with summary metrics and insights

        """
        totals = calculator.calculate_totals(transactions)
        expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]

        category_totals = calculator.group_by_category(expenses)
        top_categories = sorted(category_totals.items(), key=lambda x: x[1], reverse=True)[:5]

        return {
            "month": month,
            "total_income": totals["total_income"],
            "total_expenses": totals["total_expenses"],
            "surplus": totals["net_change"],
            "transaction_count": len(transactions),
            "expense_count": len(expenses),
            "top_categories": [{"category": cat, "amount": amt} for cat, amt in top_categories],
            "savings_rate": calculator.calculate_savings_rate(
                totals["total_income"],
                totals["total_expenses"],
            ),
        }

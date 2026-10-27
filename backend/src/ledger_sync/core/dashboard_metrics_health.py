"""Current financial health: the analysis the Dashboard's FinancialHealthScore scores.

Port of ``computeCurrentHealth`` and ``classifyTransaction``
(``frontend/src/components/analytics/health/``) returning the same numbers on the
same rows (see ``dashboard_metrics_base`` for the arithmetic rules); the
``computeAnalysis`` it hands the month buckets to is ``dashboard_metrics_analysis``.
The 0-100 scores stay in the browser; ``calculateMetrics`` and ``computeCFPScore``
read this result.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

from ledger_sync.core.dashboard_metrics_analysis import MonthBucket, compute_analysis
from ledger_sync.core.dashboard_metrics_base import LedgerRow
from ledger_sync.core.dashboard_metrics_inputs import analysis_period, earning_start
from ledger_sync.core.expense_class import is_capital_loss
from ledger_sync.core.metric_rules import is_essential_expense, is_investment_account

# ``DEBT_CATEGORIES`` and ``INVESTMENT_NOTE_KEYWORDS`` (healthScoreTypes.ts), lower-cased.
_DEBT_WORDS = (
    "emi",
    "loan",
    "credit card payment",
    "mortgage",
    "personal loan",
    "car loan",
    "home loan",
)
_INVESTMENT_NOTE_WORDS = ("sip", "mutual fund", "investment", "ppf", "nps", "elss", "epf")


@dataclass(frozen=True, slots=True)
class HealthRules:
    """The preferences that decide where each row is counted."""

    investment_accounts: frozenset[str]
    essentials: frozenset[str]
    fixed: frozenset[str]
    loss_keys: set[str]


def _mentions(text: str, words: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(word in lowered for word in words)


def _investment_delta(row: LedgerRow, accounts: frozenset[str]) -> float:
    """Money crossing the investment perimeter; a note may name an unmapped destination."""
    if row.type != "Transfer":
        return 0.0
    from_investment = bool(row.from_account) and is_investment_account(row.from_account, accounts)
    inferred = not from_investment and (
        _mentions(row.note, _INVESTMENT_NOTE_WORDS)
        or _mentions(row.category, _INVESTMENT_NOTE_WORDS)
    )
    into = bool(row.to_account) and (is_investment_account(row.to_account, accounts) or inferred)
    out = from_investment or (
        bool(row.from_account) and row.from_account == row.to_account and inferred
    )
    return row.amount * (int(into) - int(out))


def _classify(row: LedgerRow, bucket: MonthBucket, rules: HealthRules) -> None:
    """``classifyTransaction``: one row into the bucket it belongs to."""
    amount = abs(row.amount)
    delta = _investment_delta(row, rules.investment_accounts)
    if delta > 0:
        bucket.inflow += delta
    elif delta < 0:
        bucket.outflow -= delta
    elif row.type == "Income":
        bucket.income += amount
    elif row.type == "Expense" and not is_capital_loss(
        row.category, row.subcategory, rules.loss_keys
    ):
        category = row.category or "Other"
        bucket.expense += amount
        if _mentions(category, _DEBT_WORDS):
            bucket.debt += amount
        fixed = bool(rules.fixed) and (
            category.lower() in rules.fixed
            or f"{category}::{row.subcategory}".lower() in rules.fixed
        )
        if is_essential_expense(category, row.subcategory, rules.essentials) or fixed:
            bucket.essential += amount


def current_health(
    rows: Sequence[LedgerRow],
    rules: HealthRules,
    saved_start: str | None,
    balances: Mapping[str, float] | None,
    today: date,
) -> dict[str, Any] | None:
    """Trailing 24 completed months from employment start, or None below 10 rows / 3 months."""
    historical = [row for row in rows if row.date.date() <= today]
    if len(historical) < 10:
        return None
    start_day, source = earning_start(saved_start, historical, today)
    months, first_day, last_day = analysis_period(
        (row.date.isoformat()[:7] for row in historical), start_day, today
    )
    if len(months) < 3 or first_day is None or last_day is None:
        return None
    monthly = {month: MonthBucket() for month in months}
    lifetime = MonthBucket()
    for row in historical:
        _classify(row, lifetime, rules)
        day = row.date.date().isoformat()
        if first_day <= day <= last_day:
            _classify(row, monthly[day[:7]], rules)
    return {
        "analysis": compute_analysis([monthly[month] for month in months], lifetime, balances),
        "period": {"months": months, "start_date": first_day, "end_date": last_day},
        "earning_start": {"date": start_day, "source": source},
    }

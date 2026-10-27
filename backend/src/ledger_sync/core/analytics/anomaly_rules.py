"""Rules the anomaly engine shares: which detectors run, finding identity, caps.

Plain functions over plain values, so ``AnomaliesMixin._detect_anomalies`` stays
an orchestrator and each rule can be read without a database session.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from statistics import median
from typing import Any

from ledger_sync.core.expense_class import is_capital_loss
from ledger_sync.core.preference_json import parse_json_preference
from ledger_sync.db.models import AnomalyType, Transaction, TransactionType

#: The four types the old "Enabled Types" grid offered. They are also the column
#: default and the value ``POST /api/preferences/reset`` writes.
LEGACY_TOGGLE_TYPES = frozenset(
    {
        AnomalyType.HIGH_EXPENSE,
        AnomalyType.UNUSUAL_CATEGORY,
        AnomalyType.LARGE_TRANSFER,
        AnomalyType.BUDGET_EXCEEDED,
    }
)
ALL_TYPES: frozenset[AnomalyType] = frozenset(AnomalyType)
_NEWER_TYPES = ALL_TYPES - LEGACY_TOGGLE_TYPES
_BY_VALUE = {member.value: member for member in AnomalyType}

FEE_CHARGE = AnomalyType.FEE_CHARGE

#: ``review_notes`` prefix of a row the engine dismissed itself. Such a row has
#: no ``reviewed_at`` (the review endpoint always sets one) and is rebuilt on
#: every refresh, so switching ``auto_dismiss_recurring_anomalies`` off brings
#: the finding back as an open one.
AUTO_DISMISS_PREFIX = "Auto-dismissed: "

#: Findings that share a type and a month carry their subject (a category, a
#: commitment) between a fixed prefix and the LAST ": " of the description, so
#: a reviewed one is recognised on the next refresh. Amounts change between
#: refreshes, so the whole description cannot be the key.
UNUSUAL_CATEGORY_PREFIX = "Unusual spending in "
MISSING_RECURRING_PREFIX = "Missing "
_SUBJECT_PREFIXES = {
    AnomalyType.UNUSUAL_CATEGORY: UNUSUAL_CATEGORY_PREFIX,
    AnomalyType.MISSING_RECURRING: MISSING_RECURRING_PREFIX,
}

#: Open rows kept per type, newest first; fee, closed-account and any other type
#: keep ``_DEFAULT_CAP``. HIGH_EXPENSE keeps its own split.
_TYPE_CAPS = {
    AnomalyType.UNUSUAL_CATEGORY: 20,
    AnomalyType.LARGE_TRANSFER: 15,
    AnomalyType.DUPLICATE_SUSPECTED: 20,
    AnomalyType.MISSING_RECURRING: 15,
}
_DEFAULT_CAP = 25
_AUTO_DISMISSED_CAP = 25
# Month rows and single-transaction rows have different natural deviation_pct
# scales, so a global sort let hundreds of 300%-deviation transaction flags
# evict nearly every month anomaly. Up to 25 slots go to months, the rest of 50
# to transactions.
_HIGH_EXPENSE_MONTH_CAP = 25
_HIGH_EXPENSE_TOTAL_CAP = 50
_SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}


def enabled_anomaly_types(raw: object) -> frozenset[AnomalyType]:
    """The detectors to run for a stored ``anomaly_types_enabled`` value.

    - Unset, unreadable, or exactly the legacy four (the default and reset
      value): every detector runs. Until the engine read this column it
      controlled nothing, so the default list is no choice to switch the
      newer detectors off.
    - A list naming none of the newer types was saved by the old four-type
      grid: it is honoured for those four and every newer type stays on.
    - Anything else is the complete allow-list the current control saved.
      The /anomalies panel always includes ``closed_account_activity``, which
      it keeps on, so every list it saves takes this branch.
    """
    parsed = parse_json_preference(raw, None)
    if not isinstance(parsed, list):
        return ALL_TYPES
    # An unhashable element would make ``in`` raise and abort the refresh.
    named = frozenset(
        _BY_VALUE[value] for value in parsed if isinstance(value, str) and value in _BY_VALUE
    )
    if named == LEGACY_TOGGLE_TYPES:
        return ALL_TYPES
    if not named & _NEWER_TYPES:
        return named | _NEWER_TYPES
    return named


def described(prefix: str, subject: str, detail: str) -> str:
    """A description ``subject_of`` can read the subject back from."""
    return f"{prefix}{subject}: {detail}"


def subject_of(anomaly_type: AnomalyType, description: str | None) -> str | None:
    prefix = _SUBJECT_PREFIXES.get(anomaly_type)
    if prefix is None or not description or not description.startswith(prefix):
        return None
    subject, separator, _detail = description.removeprefix(prefix).rpartition(": ")
    return subject if separator else None


def finding_key(
    anomaly_type: AnomalyType,
    period_key: str | None,
    transaction_id: str | None,
    description: str | None,
) -> tuple[Any, ...]:
    """What makes two findings the same one across refreshes.

    A transaction-level finding is its type plus the transaction, so a reviewed
    large-expense flag never silences a fee flag on the same row. A month-level
    one is its type, month and subject, so reviewing one category's unusual
    month never silences another category's.
    """
    if transaction_id:
        return (anomaly_type, transaction_id)
    return (anomaly_type, period_key, subject_of(anomaly_type, description))


def month_index(when: date) -> int:
    return when.year * 12 + when.month - 1


class SpendScale:
    """Median monthly spend over the 12 months ending at a month.

    The yardstick for "material": a fraction of the all-time median is far too
    low for a ledger whose spending grew (on one real ledger the latest year's
    median month was about 7x the all-time one), so floors follow the spending
    level of the time they judge.
    """

    def __init__(self, monthly_spend: dict[int, float]) -> None:
        self._monthly = monthly_spend
        self._cache: dict[int, float] = {}

    @classmethod
    def from_ledger(cls, ledger: list[Transaction], loss_keys: set[str]) -> SpendScale:
        """Monthly expense totals, with classified realised losses left out."""
        monthly: dict[int, float] = defaultdict(float)
        for txn in ledger:
            if txn.type == TransactionType.EXPENSE and not is_capital_loss(
                txn.category, txn.subcategory, loss_keys
            ):
                monthly[month_index(txn.date)] += float(txn.amount)
        return cls(monthly)

    def at(self, when: date) -> float:
        month = month_index(when)
        if month not in self._cache:
            window = [v for m, v in self._monthly.items() if month - 11 <= m <= month]
            self._cache[month] = median(window) if window else 0.0
        return self._cache[month]


def is_auto_dismissed(reviewed_at: datetime | None, review_notes: str | None) -> bool:
    return reviewed_at is None and bool(
        review_notes and review_notes.startswith(AUTO_DISMISS_PREFIX)
    )


def _deviation(finding: dict[str, Any]) -> float:
    return float(finding.get("deviation_pct") or 0)


def _newest_first(finding: dict[str, Any]) -> tuple[int, int]:
    when: date | None = finding.get("_when")
    return (
        -(when.toordinal() if when else 0),
        _SEVERITY_RANK.get(str(finding.get("severity")), len(_SEVERITY_RANK)),
    )


def cap_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Bound what one refresh stores: per type, newest first, auto-dismissed apart."""
    by_type: dict[AnomalyType, list[dict[str, Any]]] = {}
    dismissed: list[dict[str, Any]] = []
    for finding in findings:
        if finding.get("_auto_dismiss"):
            dismissed.append(finding)
        else:
            by_type.setdefault(finding["type"], []).append(finding)
    kept: list[dict[str, Any]] = []
    for anomaly_type, rows in by_type.items():
        if anomaly_type == AnomalyType.HIGH_EXPENSE:
            months = sorted((r for r in rows if r.get("period_key")), key=_deviation, reverse=True)
            months = months[:_HIGH_EXPENSE_MONTH_CAP]
            singles = sorted(
                (r for r in rows if not r.get("period_key")), key=_deviation, reverse=True
            )
            kept += months + singles[: _HIGH_EXPENSE_TOTAL_CAP - len(months)]
        else:
            kept += sorted(rows, key=_newest_first)[: _TYPE_CAPS.get(anomaly_type, _DEFAULT_CAP)]
    return kept + sorted(dismissed, key=_newest_first)[:_AUTO_DISMISSED_CAP]

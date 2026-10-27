"""Which recurring pattern a ledger row is an entry of.

``RecurringIndex`` keys the user's live patterns the way recurring detection
groups transactions (``group_txns_by_pattern``: the normalised note, else the
category and subcategory), so the anomaly engine can ask "is this row a bill?"
without re-running detection. ``auto_dismiss_matches`` (the
``auto_dismiss_recurring_anomalies`` setting) and the missing-entry check both
ask it.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from typing import Any

from ledger_sync.core.analytics.anomaly_rules import AUTO_DISMISS_PREFIX
from ledger_sync.core.analytics.recurring import normalize_recurring_note
from ledger_sync.core.analytics.recurring_amounts import effective_expected_amount
from ledger_sync.core.query_helpers import as_naive
from ledger_sync.db.models import (
    AnomalyType,
    RecurrenceFrequency,
    RecurringTransaction,
    Transaction,
)

_FREQ = RecurrenceFrequency
#: Schedules whose entries already sit in every month's baseline.
EVERY_MONTH = frozenset({_FREQ.DAILY, _FREQ.WEEKLY, _FREQ.BIWEEKLY, _FREQ.MONTHLY})
#: A row this close to an expected amount (or within two spreads) is a match.
_AMOUNT_TOLERANCE = 0.15
#: Finding types a recurring match can explain. A duplicate, a fee or a
#: closed-account row is a problem even when it repeats. Large transfers are
#: not here: recurring patterns are only income or expense (detection reads no
#: transfers), and a match needs the same type.
_DISMISSIBLE = frozenset({AnomalyType.HIGH_EXPENSE})


def transaction_label(txn: Transaction) -> str:
    """The label recurring detection groups this row under (``group_txns_by_pattern``)."""
    label = normalize_recurring_note(txn.note)
    if label:
        return label
    category = txn.category.lower()
    return f"{category} - {txn.subcategory.lower()}" if txn.subcategory else category


def pattern_labels(pattern: RecurringTransaction) -> set[str]:
    names = (normalize_recurring_note(pattern.pattern_name), pattern.pattern_name.lower())
    return {name for name in names if name}


def amount_fits(amount: float, pattern: RecurringTransaction) -> bool:
    """Whether *amount* is a typical entry: near the user's amount or the detected one.

    Both count, because the detected amount describes the history and the
    user's amount the entries from now on. The pattern read must use
    ``recurring_amounts.load_user_amount()``.
    """
    spread_floor = 2 * float(pattern.amount_variance or 0)
    for expected in {float(pattern.expected_amount), float(effective_expected_amount(pattern))}:
        if abs(amount - expected) <= max(spread_floor, _AMOUNT_TOLERANCE * abs(expected)):
            return True
    return False


class RecurringIndex:
    """Active recurring patterns, keyed the way detection groups transactions."""

    def __init__(self, patterns: list[RecurringTransaction]) -> None:
        self.patterns = patterns
        self._by_label: dict[tuple[str, str], list[RecurringTransaction]] = defaultdict(list)
        for pattern in patterns:
            for label in pattern_labels(pattern):
                self._by_label[label, pattern.transaction_type.value].append(pattern)

    def match(self, txn: Transaction) -> RecurringTransaction | None:
        """The pattern *txn* is an entry of: same label and type, a typical amount."""
        amount = float(txn.amount)
        for pattern in self._by_label.get((transaction_label(txn), txn.type.value), ()):
            if amount_fits(amount, pattern):
                return pattern
        return None

    def scheduled_share(self, rows: Iterable[Transaction]) -> tuple[float, list[str]]:
        """What *rows* paid on a schedule longer than a month, with those patterns' names."""
        total = 0.0
        names: list[str] = []
        for txn in rows:
            pattern = self.match(txn)
            if pattern is None or pattern.frequency in EVERY_MONTH:
                continue
            total += float(txn.amount)
            if pattern.pattern_name not in names:
                names.append(pattern.pattern_name)
        return total, names


def auto_dismiss_matches(
    findings: list[dict[str, Any]], by_id: dict[str, Transaction], index: RecurringIndex
) -> None:
    """Mark the large-expense findings that are a recurring entry."""
    for finding in findings:
        txn = by_id.get(finding.get("transaction_id") or "")
        if finding["type"] not in _DISMISSIBLE or txn is None or finding.get("_auto_dismiss"):
            continue
        pattern = index.match(txn)
        if pattern is not None:
            finding["_auto_dismiss"] = (
                f"{AUTO_DISMISS_PREFIX}an entry of the recurring {pattern.pattern_name}."
            )
            finding["_when"] = as_naive(txn.date).date()

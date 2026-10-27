"""Missing entries of the commitments the user confirmed.

``_detect_missing_recurring`` flags a confirmed commitment whose next entry did
not arrive within its window. ``anomaly_recurring_index`` says which pattern a
row belongs to.

A commitment is judged against the data the account actually has: "missing"
means the account holds rows past the payment's grace window and none of them
is the payment. An account whose last import is older than the due date is
stale, not missing, so nothing fires before the data could show the payment.

Which dues were missed is ``anomaly_recurring_schedule.missed_entries``. One
finding stands for the latest run of missed entries, so "Still expected" (a
review) asks again when a later one is missed too. "Ended or paid elsewhere"
(a dismissal) keeps the commitment quiet until an entry arrives again and a
later one goes missing.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Any

from ledger_sync.core.analytics.anomaly_recurring_index import (
    RecurringIndex,
    amount_fits,
    pattern_labels,
    transaction_label,
)
from ledger_sync.core.analytics.anomaly_recurring_schedule import missed_entries
from ledger_sync.core.analytics.anomaly_rules import (
    MISSING_RECURRING_PREFIX,
    described,
    subject_of,
)
from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.core.analytics.recurring import DISMISSED_PATTERN_KIND, effective_pattern_kind
from ledger_sync.core.analytics.recurring_amounts import (
    effective_expected_amount,
    load_user_amount,
)
from ledger_sync.core.ledger_clock import ledger_now
from ledger_sync.core.query_helpers import as_naive, closed_accounts_for
from ledger_sync.db.models import (
    Anomaly,
    AnomalyType,
    RecurringTransaction,
    Transaction,
    TransactionType,
)


class _EntryIndex:
    """Income and expense rows by recurring label and by taxonomy, built once a refresh."""

    def __init__(self, ledger: list[Transaction]) -> None:
        self._by_label: dict[tuple[str, str], list[Transaction]] = defaultdict(list)
        self._by_taxonomy: dict[tuple[str, str, str | None], list[Transaction]] = defaultdict(list)
        for txn in ledger:
            if txn.type != TransactionType.TRANSFER:
                self._by_label[txn.type.value, transaction_label(txn)].append(txn)
                self._by_taxonomy[txn.type.value, txn.category, txn.subcategory].append(txn)

    def entry_dates(self, pattern: RecurringTransaction) -> list[datetime]:
        """Dates of rows that could be *pattern*'s entry, under any of its labels."""
        kind = pattern.transaction_type.value
        candidates = {
            id(txn): txn
            for label in pattern_labels(pattern)
            for txn in self._by_label.get((kind, label), ())
        }
        for txn in self._by_taxonomy.get((kind, pattern.category, pattern.subcategory), ()):
            candidates[id(txn)] = txn
        return sorted(
            as_naive(txn.date)
            for txn in candidates.values()
            if amount_fits(float(txn.amount), pattern)
        )


class AnomalyRecurringMixin(AnalyticsEngineBase):
    """Mixin: the live recurring patterns, and missing entries of confirmed ones."""

    def _recurring_index(self) -> RecurringIndex:
        """The user's live patterns, as the recurring API lists them."""
        min_confidence = self.recurring_min_confidence
        rows = (
            self.db.query(RecurringTransaction)
            .options(load_user_amount())
            .filter(
                RecurringTransaction.user_id == self.user_id,
                RecurringTransaction.is_active.is_(True),
                RecurringTransaction.pattern_kind != DISMISSED_PATTERN_KIND,
            )
            .all()
        )
        return RecurringIndex(
            [r for r in rows if r.is_user_confirmed or r.confidence_score >= min_confidence]
        )

    def _dismissed_gaps(self) -> dict[str, str]:
        """Per commitment name, the latest month of a missing entry the user dismissed."""
        rows = (
            self.db.query(Anomaly.period_key, Anomaly.description)
            .filter(
                Anomaly.user_id == self.user_id,
                Anomaly.anomaly_type == AnomalyType.MISSING_RECURRING,
                Anomaly.is_dismissed.is_(True),
            )
            .all()
        )
        latest: dict[str, str] = {}
        for period, description in rows:
            name = subject_of(AnomalyType.MISSING_RECURRING, description)
            if name and period and period > latest.get(name, ""):
                latest[name] = period
        return latest

    def _detect_missing_recurring(
        self, anomalies: list[dict[str, Any]], ledger: list[Transaction], index: RecurringIndex
    ) -> None:
        """Flag confirmed commitments whose next entry is past its grace window, unpaid."""
        confirmed = [
            p
            for p in index.patterns
            if p.is_user_confirmed and effective_pattern_kind(p) == "commitment"
        ]
        if not ledger or not confirmed:
            return
        today = ledger_now()
        horizon = {txn.account.lower(): as_naive(txn.date) for txn in ledger}  # ascending
        latest = min(as_naive(ledger[-1].date), today)
        closed = closed_accounts_for(self.db, self.user_id)
        dismissed = self._dismissed_gaps()
        entries = _EntryIndex(ledger)
        for pattern in confirmed:
            account = (pattern.account or "").lower()
            if account in closed:
                continue
            as_of = min(horizon.get(account, latest), today)
            missed = missed_entries(pattern, entries.entry_dates(pattern), as_of)
            # A dismissal at or after this gap's first miss said it ended.
            if missed is None or dismissed.get(pattern.pattern_name, "") >= f"{missed[0]:%Y-%m}":
                continue
            anomalies.append(self._missing_finding(pattern, *missed))

    def _missing_finding(
        self,
        pattern: RecurringTransaction,
        first: datetime,
        due: datetime,
        last: datetime,
        count: int,
    ) -> dict[str, Any]:
        sym = self._currency_symbol
        amount = effective_expected_amount(pattern)
        detail = (
            f"expected {sym}{float(amount):,.0f} around {due:%d %b %Y}; "
            f"last recorded {last:%d %b %Y}"
        )
        if count > 1:
            detail += f"; {count} entries missing since {first:%d %b %Y}"
        income = pattern.transaction_type == TransactionType.INCOME
        return {
            "type": AnomalyType.MISSING_RECURRING,
            "severity": "high" if income or count > 1 else "medium",
            "description": described(MISSING_RECURRING_PREFIX, pattern.pattern_name, detail),
            "period_key": due.strftime("%Y-%m"),
            "expected_value": amount,
            "actual_value": Decimal("0"),
            "deviation_pct": -100.0,
            "_when": due.date(),
        }

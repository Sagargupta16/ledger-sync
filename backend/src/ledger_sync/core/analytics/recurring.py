"""Recurring transaction detection mixin."""

from __future__ import annotations

import math
from datetime import UTC, datetime
from statistics import mean, stdev

from sqlalchemy import delete

from ledger_sync.core._analytics_helpers import (
    group_txns_by_pattern as _group_txns_by_pattern,
)
from ledger_sync.core._analytics_helpers import (
    infer_expected_day_of_month as _infer_expected_day_of_month,
)
from ledger_sync.core._analytics_helpers import (
    normalize_note as _normalize_note,
)
from ledger_sync.core._analytics_helpers import (
    resolve_pattern_display as _resolve_pattern_display,
)
from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.db.models import (
    RecurrenceFrequency,
    RecurringTransaction,
    Transaction,
    TransactionType,
)


class RecurringMixin(AnalyticsEngineBase):
    """Mixin: recurring-pattern detection and persistence."""

    # Frequency bands: (min_days, max_days, frequency, confidence_penalty_per_std)
    _FREQ_BANDS: list[tuple[float, float, RecurrenceFrequency, float]] = [
        (4, 10, RecurrenceFrequency.WEEKLY, 8),
        (11, 18, RecurrenceFrequency.BIWEEKLY, 5),
        (20, 45, RecurrenceFrequency.MONTHLY, 3),
        (50, 75, RecurrenceFrequency.BIMONTHLY, 2.5),
        (80, 110, RecurrenceFrequency.QUARTERLY, 2),
        (150, 210, RecurrenceFrequency.SEMIANNUAL, 1.5),
        (340, 395, RecurrenceFrequency.YEARLY, 1),
    ]

    def _load_confirmed_recurring(self) -> dict[str, RecurringTransaction]:
        """Load user-confirmed recurring patterns keyed by lowercase name."""
        if self.user_id is None:
            return {}
        confirmed = (
            self.db.query(RecurringTransaction)
            .filter(
                RecurringTransaction.user_id == self.user_id,
                RecurringTransaction.is_user_confirmed.is_(True),
            )
            .all()
        )
        return {c.pattern_name.lower(): c for c in confirmed}

    def _detect_recurring_transactions(
        self,
        transactions: list[Transaction] | None = None,
    ) -> int:
        """Detect recurring transaction patterns grouped by note/category."""
        if transactions is None:
            transactions = (
                self._user_transaction_query()
                .filter(Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]))
                .order_by(Transaction.date)
                .all()
            )
        else:
            transactions = sorted(transactions, key=lambda t: t.date)

        # Group by normalized note + type. Transactions without a note fall
        # back to category + subcategory so they still get detected.
        patterns = _group_txns_by_pattern(transactions, _normalize_note)

        # Delete only non-confirmed records; user-confirmed ones are preserved
        del_stmt = delete(RecurringTransaction).where(
            RecurringTransaction.is_user_confirmed.is_(False),
        )
        if self.user_id is not None:
            del_stmt = del_stmt.where(RecurringTransaction.user_id == self.user_id)
        self.db.execute(del_stmt)

        confirmed_names = self._load_confirmed_recurring()
        min_conf = self.recurring_min_confidence

        count = 0
        for (label, txn_type), txns in patterns.items():
            if len(txns) < 3:  # Need at least 3 occurrences
                continue

            dates = [t.date for t in txns]
            amounts = [float(t.amount) for t in txns]

            # Detect frequency
            frequency, confidence, expected_day = self._detect_frequency(dates)
            if not frequency or confidence < min_conf:
                continue

            avg_amount = mean(amounts)
            amount_variance = stdev(amounts) if len(amounts) > 1 else 0

            info = _resolve_pattern_display(
                txns,
                dates,
                avg_amount,
                amount_variance,
                frequency,
                confidence,
                expected_day,
                txn_type,
            )

            # If a user-confirmed record matches, update its stats instead
            if label in confirmed_names:
                existing = confirmed_names[label]
                existing.occurrences_detected = info["occurrences"]
                existing.last_occurrence = info["last_occurrence"]
                existing.confidence_score = info["confidence"]
                existing.expected_amount = info["expected_amount"]
                existing.amount_variance = info["amount_variance"]
                existing.last_updated = datetime.now(UTC)
                count += 1
                continue

            recurring = RecurringTransaction(
                user_id=self.user_id,
                pattern_name=info["pattern_name"],
                category=info["category"],
                subcategory=info["subcategory"],
                account=info["account"],
                transaction_type=TransactionType(info["txn_type"]),
                frequency=info["frequency"],
                expected_amount=info["expected_amount"],
                amount_variance=info["amount_variance"],
                expected_day=info["expected_day"],
                confidence_score=info["confidence"],
                occurrences_detected=info["occurrences"],
                last_occurrence=info["last_occurrence"],
                is_active=True,
                first_detected=datetime.now(UTC),
                last_updated=datetime.now(UTC),
            )
            self.db.add(recurring)
            count += 1

        return count

    def _detect_frequency(
        self,
        dates: list[datetime],
    ) -> tuple[RecurrenceFrequency | None, float, int | None]:
        """Infer recurrence frequency + confidence + expected day from dates."""
        if len(dates) < 3:
            return None, 0, None

        sorted_dates = sorted(dates)
        day_diffs = [
            (sorted_dates[i + 1] - sorted_dates[i]).days for i in range(len(sorted_dates) - 1)
        ]

        avg_diff = mean(day_diffs)
        std_diff = stdev(day_diffs) if len(day_diffs) > 1 else math.inf

        frequency = None
        confidence: float = 0
        expected_day = None

        for lo, hi, freq, penalty in self._FREQ_BANDS:
            if lo <= avg_diff <= hi:
                frequency = freq
                confidence = max(0, 100 - std_diff * penalty)
                break

        # Calculate expected day of month for monthly-ish frequencies
        if frequency in (
            RecurrenceFrequency.MONTHLY,
            RecurrenceFrequency.BIMONTHLY,
            RecurrenceFrequency.QUARTERLY,
            RecurrenceFrequency.SEMIANNUAL,
            RecurrenceFrequency.YEARLY,
        ):
            expected_day = _infer_expected_day_of_month([d.day for d in sorted_dates])

        return frequency, confidence, expected_day

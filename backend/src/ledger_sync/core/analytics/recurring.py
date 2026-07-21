"""Recurring transaction detection mixin."""

from __future__ import annotations

from datetime import UTC, datetime
from statistics import median

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
from ledger_sync.core.query_helpers import closed_accounts_for
from ledger_sync.db.models import (
    RecurrenceFrequency,
    RecurringTransaction,
    Transaction,
    TransactionType,
)


class RecurringMixin(AnalyticsEngineBase):
    """Mixin: recurring-pattern detection and persistence."""

    # Frequency bands: (min_days, frequency, confidence_penalty_per_day).
    # Each band starts at min_days and runs up to (but not including) the
    # next band's min_days, so float medians between integer thresholds
    # (e.g. med = 10.5) resolve cleanly instead of falling through the
    # gap. The final band has an effective upper bound of 400 days
    # enforced below. Penalty scales with expected cadence -- wider
    # cycles tolerate more jitter -- and is applied to the median folded
    # day residual in ``_folded_confidence``.
    _FREQ_BANDS: list[tuple[float, RecurrenceFrequency, float]] = [
        (4, RecurrenceFrequency.WEEKLY, 8),
        (11, RecurrenceFrequency.BIWEEKLY, 5),
        (20, RecurrenceFrequency.MONTHLY, 3),
        (50, RecurrenceFrequency.BIMONTHLY, 2.5),
        (80, RecurrenceFrequency.QUARTERLY, 2),
        (130, RecurrenceFrequency.SEMIANNUAL, 1.5),
        (270, RecurrenceFrequency.YEARLY, 1),
    ]
    # Cadences longer than this are out of scope for personal finance
    # recurring detection (annual upper bound = 400 days to allow some
    # leap-year / late-by-a-week tolerance).
    _FREQ_MAX_DAYS: float = 400

    def _load_confirmed_recurring(self) -> dict[str, RecurringTransaction]:
        """Load user-confirmed recurring patterns keyed by group label.

        Detection groups transactions by ``normalize_note(txn.note)`` (falling
        back to the lowercased category/subcategory), but ``pattern_name``
        stores the raw most-recent note (e.g. "Rent Mar 2026"). Keying each
        confirmed record by BOTH the normalized name and the plain lowercase
        name lets the refresh find the confirmed row under the stable group
        label ("rent") instead of creating an unconfirmed duplicate while the
        confirmed row's stats freeze.
        """
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
        keyed: dict[str, RecurringTransaction] = {}
        for c in confirmed:
            normalized = _normalize_note(c.pattern_name)
            if normalized:
                keyed[normalized] = c
            keyed[c.pattern_name.lower()] = c
        return keyed

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

        # A closed account has no future cash flows: don't create new
        # recurring expectations on it, and deactivate confirmed ones so
        # the bill calendar / missed-payment logic stops expecting them.
        closed = closed_accounts_for(self.db, self.user_id)
        for existing in confirmed_names.values():
            if existing.account in closed and existing.is_active:
                existing.is_active = False
                existing.last_updated = datetime.now(UTC)

        count = 0
        for (label, txn_type), txns in patterns.items():
            if len(txns) < 3:  # Need at least 3 occurrences
                continue

            if closed and all(t.account in closed for t in txns):
                continue

            dates = [t.date for t in txns]
            amounts = [float(t.amount) for t in txns]

            # Detect frequency
            frequency, confidence, expected_day = self._detect_frequency(dates)
            if not frequency or confidence < min_conf:
                continue

            # Median + scaled MAD: recurring groups routinely mix a dominant
            # regular amount with a few small adjustment rows under the same
            # note, and a mean/stdev pair gets dragged far from the typical
            # payment. 1.4826 scales MAD to stdev-like units.
            avg_amount = median(amounts)
            amount_variance = (
                1.4826 * median(abs(a - avg_amount) for a in amounts) if len(amounts) > 1 else 0.0
            )

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
        """Infer recurrence frequency + confidence + expected day from dates.

        Bands on the MEDIAN gap between unique days -- the mean of
        consecutive gaps telescopes to span/(n-1), so a couple of skipped
        periods used to drag a monthly stream into the wrong band.
        Confidence then scores gaps folded to multiples of the median
        (see ``_folded_confidence``), so a skipped month reads as a skip
        penalty instead of exploding the jitter term.
        """
        days = sorted({d.date() for d in dates})
        if len(days) < 3:
            return None, 0, None

        diffs = [(days[i + 1] - days[i]).days for i in range(len(days) - 1)]
        med = median(diffs)

        frequency = None
        confidence: float = 0
        expected_day = None

        # Walk bands in order; each band runs from its min_days up to (but
        # not including) the next band's min_days. The final band caps at
        # ``_FREQ_MAX_DAYS`` so absurdly long cadences don't get a label.
        for i, (lo, freq, penalty) in enumerate(self._FREQ_BANDS):
            next_lo = (
                self._FREQ_BANDS[i + 1][0] if i + 1 < len(self._FREQ_BANDS) else self._FREQ_MAX_DAYS
            )
            if lo <= med < next_lo:
                frequency = freq
                confidence = self._folded_confidence(diffs, med, penalty)
                break

        # Calculate expected day of month for monthly-ish frequencies
        if frequency in (
            RecurrenceFrequency.MONTHLY,
            RecurrenceFrequency.BIMONTHLY,
            RecurrenceFrequency.QUARTERLY,
            RecurrenceFrequency.SEMIANNUAL,
            RecurrenceFrequency.YEARLY,
        ):
            # Feed every occurrence (not just unique days) so the mode-first
            # day inference keeps its original multiplicity behaviour.
            expected_day = _infer_expected_day_of_month([d.day for d in dates])

        return frequency, confidence, expected_day

    @staticmethod
    def _folded_confidence(diffs: list[int], med: float, penalty: float) -> float:
        """Score gap regularity with skips folded to multiples of the median.

        Each gap snaps to its nearest multiple of the median interval (a
        skipped period doubles one gap; folding recovers the underlying
        cadence). Confidence loses the median folded DAY residual scaled
        by the band's penalty (jitter term) plus 25 points per unit of
        skip RATE -- so occasional skips in a long regular stream cost
        little, while a stream that is mostly skips scores low.
        """
        residuals: list[float] = []
        skips = 0
        for d in diffs:
            k = max(1, round(d / med))
            skips += k - 1
            residuals.append(abs(d - k * med))
        return max(0.0, 100 - median(residuals) * penalty - (skips / len(diffs)) * 25)

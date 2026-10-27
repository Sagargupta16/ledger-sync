"""Row-level checks: suspected duplicates, fee and interest charges, closed accounts.

- **Possible duplicate**: two rows on the same account with the same type,
  amount and note within a few days. The note is compared after
  ``clean_note`` (export artefacts, quantity prefixes and trailing dates go)
  and the account by its ledger id, so a row from a Money Manager backup and
  one from a spreadsheet export compare equal when their source labels differ
  only in ways the account aliases already resolve. A habit is not a double
  entry: a repeat is suspect only when this payee's other repeats are far
  apart (or, a day or more apart, when the amount is material or the payee
  bills on a regular cadence such as a subscription).
- **Fee or interest**: an expense whose category, subcategory or note names a
  late fee, a finance charge, forex markup or a card annual fee. The patterns
  live in ``anomaly_fee_patterns``; none names a bank, card or account.
- **Closed-account activity**: rows dated after an account's recorded close.
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from itertools import pairwise
from statistics import median
from typing import Any

from ledger_sync.core.analytics.anomaly_fee_patterns import PENALTY_KINDS, SCAN_CHARS, fee_kind
from ledger_sync.core.analytics.anomaly_rules import FEE_CHARGE, SpendScale
from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.core.analytics.merchant_extract import clean_note, is_placeholder
from ledger_sync.core.query_helpers import as_naive
from ledger_sync.db.models import AnomalyType, Transaction, TransactionType
from ledger_sync.services.account_settings import get_closed_account_dates

_DUPLICATE_WINDOW_DAYS = 3
#: Repeats below this share of a month's typical spend are never flagged: on a
#: real cashbook most same-day repeats under it were two meals at one price.
_DUPLICATE_FLOOR = 0.005
#: A repeat a day or more apart needs this share to count as material.
_DUPLICATE_MATERIAL = 0.05
#: Typical gap (days) between this payee's OTHER repeats for a same-day pair.
_SAME_DAY_TYPICAL_GAP = 8
#: Typical gap of a regular payee (a subscription) whose double charge counts.
_REGULAR_TYPICAL_GAP = 20
_CLOSED_ACTIVITY_PER_ACCOUNT = 5


def _account_ref(account_id: int | None, label: str | None) -> int | str:
    """The ledger account id, which the source labels' aliases resolve to; else the label."""
    return account_id if account_id is not None else (label or "").lower()


def _payee(note: str | None) -> str | None:
    """``clean_note`` of the first ``SCAN_CHARS``: its trailer regex is quadratic in length."""
    return clean_note((note or "")[:SCAN_CHARS])


def _duplicate_key(txn: Transaction) -> tuple[Any, ...] | None:
    note = _payee(txn.note)
    if not note or is_placeholder(note):
        return None
    ends = (
        (
            _account_ref(txn.from_account_id, txn.from_account),
            _account_ref(txn.to_account_id, txn.to_account),
        )
        if txn.type == TransactionType.TRANSFER
        else ()
    )
    account = _account_ref(txn.account_id, txn.account)
    return (txn.type.value, account, ends, txn.amount, note.lower())


def _is_regular(gaps: list[int]) -> bool:
    typical = median(gaps)
    return typical > 0 and median(abs(g - typical) for g in gaps) <= 0.25 * typical


def _is_suspect(gap: int, others: list[int], amount: float, typical_month: float) -> bool:
    """Whether a repeat *gap* days apart looks like a double entry, not a habit."""
    if gap == 0:
        return not others or median(others) >= _SAME_DAY_TYPICAL_GAP
    if amount >= _DUPLICATE_MATERIAL * typical_month:
        return not others or median(others) >= 4 * _DUPLICATE_WINDOW_DAYS
    return len(others) >= 2 and _is_regular(others) and median(others) >= _REGULAR_TYPICAL_GAP


class AnomalyLedgerChecksMixin(AnalyticsEngineBase):
    """Mixin: duplicate, fee and closed-account checks on individual rows."""

    def _detect_duplicate_rows(
        self, anomalies: list[dict[str, Any]], ledger: list[Transaction], scale: SpendScale
    ) -> None:
        groups: dict[tuple[Any, ...], list[Transaction]] = defaultdict(list)
        for txn in ledger:  # ascending by date
            key = _duplicate_key(txn)
            if key is not None and float(txn.amount) >= _DUPLICATE_FLOOR * scale.at(txn.date):
                groups[key].append(txn)
        for rows in groups.values():
            days = [as_naive(t.date).date().toordinal() for t in rows]
            gaps = [later - earlier for earlier, later in pairwise(days)]
            for index, gap in enumerate(gaps):
                first, second = rows[index], rows[index + 1]
                others = gaps[:index] + gaps[index + 1 :]
                typical_month = scale.at(second.date)
                if gap <= _DUPLICATE_WINDOW_DAYS and _is_suspect(
                    gap, others, float(second.amount), typical_month
                ):
                    anomalies.append(self._duplicate_finding(first, second, gap))

    def _duplicate_finding(
        self, first: Transaction, second: Transaction, gap: int
    ) -> dict[str, Any]:
        sym = self._currency_symbol
        earlier, later = as_naive(first.date), as_naive(second.date)
        if gap == 0:
            when = f"twice on {later:%d %b %Y}"
        else:
            first_format = "%d %b %Y" if earlier.year != later.year else "%d %b"
            when = f"on {earlier.strftime(first_format)} and {later:%d %b %Y}"
        note = (_payee(second.note) or "")[:60]
        return {
            "type": AnomalyType.DUPLICATE_SUSPECTED,
            "severity": "high" if gap == 0 else "medium",
            "description": (
                f"Possible duplicate on {second.account}: {sym}{float(second.amount):,.0f} "
                f"for {note} {when}"
            ),
            "transaction_id": second.transaction_id,
            "period_key": later.strftime("%Y-%m"),
            "actual_value": second.amount,
            "_when": later.date(),
        }

    def _detect_fee_charges(
        self, anomalies: list[dict[str, Any]], ledger: list[Transaction]
    ) -> None:
        sym = self._currency_symbol
        for txn in ledger:
            if txn.type != TransactionType.EXPENSE:
                continue
            kind = fee_kind(txn.category, txn.subcategory, txn.note)
            if kind is None:
                continue
            when = as_naive(txn.date)
            anomalies.append(
                {
                    "type": FEE_CHARGE,
                    "severity": "high" if kind[0] in PENALTY_KINDS else "medium",
                    "description": (
                        f"{kind[1]} on {txn.account}: {sym}{float(txn.amount):,.0f} "
                        f"({txn.category}) on {when:%d %b %Y}"
                    ),
                    "transaction_id": txn.transaction_id,
                    "period_key": when.strftime("%Y-%m"),
                    "actual_value": txn.amount,
                    "_when": when.date(),
                }
            )

    def _detect_closed_account_activity(self, anomalies: list[dict[str, Any]]) -> None:
        """Flag transactions landing on a closed account after its close date.

        Statements routinely trail closures in India by a cycle or two
        (refunds, final interest, reversal entries), so new activity is
        imported normally -- this just surfaces it for review instead of
        silently absorbing it. Only rows dated AFTER the recorded close
        date count; the account's own history never triggers it.
        """
        close_dates = get_closed_account_dates(self.db, self.user_id)
        if not close_dates:
            return

        sym = self._currency_symbol
        # One candidate query for all closed accounts avoids a query per account.
        # Python lower matches the dimension keys even for Unicode source labels.
        late_txns = (
            self._user_transaction_query()
            .filter(Transaction.date > min(close_dates.values()))
            .order_by(Transaction.date.desc())
        )
        counts: dict[str, int] = {}
        for txn in late_txns:
            key = (txn.account or "").lower()
            closed_at = close_dates.get(key)
            if (
                closed_at is None
                or txn.date.replace(tzinfo=None) <= closed_at.replace(tzinfo=None)
                or counts.get(key, 0) >= _CLOSED_ACTIVITY_PER_ACCOUNT
            ):
                continue
            counts[key] = counts.get(key, 0) + 1
            anomalies.append(
                {
                    "type": AnomalyType.CLOSED_ACCOUNT_ACTIVITY,
                    "severity": "medium",
                    "description": (
                        f"Activity on closed account {txn.account}: "
                        f"{sym}{float(txn.amount):,.0f} ({txn.category}) "
                        f"on {txn.date.strftime('%d %b %Y')}"
                    ),
                    "transaction_id": txn.transaction_id,
                    "actual_value": Decimal(str(txn.amount)),
                    "_when": as_naive(txn.date).date(),
                },
            )

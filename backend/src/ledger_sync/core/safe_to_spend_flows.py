"""Dated cash flows from recurring commitments and scheduled transactions.

Safe-to-spend and the balance projection both need "what money moves on which
day". This module expands every accepted commitment and every active schedule
into the dates it falls on inside a window, as signed flows: money in is
positive, money out negative.

A commitment is accepted the way the bill calendar accepts one
(``isAcceptedRecurringCommitment`` in ``frontend/src/lib/recurringCalculations.ts``):
active, a commitment rather than a habit, and either user-confirmed or seen
within two intervals plus seven days. A schedule owns its own amount and dates,
so a commitment an active schedule already carries is read from the schedule
only. The link alone cannot say which: a Money Manager repeat rule arrives
unlinked and every analytics refresh unlinks a detected source, so the same
type and cadence plus a shared label (on the same account, or on another with
an amount within 15%), or the same amount, day, category and account, also
pair them (``safe_to_spend_labels.same_commitment``).

Only income and expense become flows. A scheduled transfer is not a bill: a
card payment settles dues the liquid figure already nets out, a move between
cash accounts stays in the pool, and the projection carries each account's
usual net transfers, SIPs included.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.recurring import DISMISSED_PATTERN_KIND, effective_pattern_kind
from ledger_sync.core.analytics.recurring_amounts import (
    effective_expected_amount,
    load_user_amount,
)
from ledger_sync.core.safe_to_spend_cadence import expand_dates, interval_days, month_day
from ledger_sync.core.safe_to_spend_labels import pattern_keys, same_commitment, schedule_labels
from ledger_sync.db.models import (
    RecurrenceFrequency,
    RecurringTransaction,
    ScheduledTransaction,
    TransactionType,
)

_FLOW_TYPES = (TransactionType.INCOME, TransactionType.EXPENSE)


@dataclass(frozen=True, slots=True)
class Flow:
    """One expected movement of money on one day."""

    name: str
    account: str
    on: date
    #: Signed: positive is money in, negative is money out.
    amount: Decimal
    source: str  # "recurring" or "scheduled"


def is_accepted_commitment(record: RecurringTransaction, today: date) -> bool:
    """The bill calendar's rule: a confirmed commitment, or one seen recently."""
    if not record.is_active or record.frequency is None:
        return False
    if effective_pattern_kind(record) != "commitment":
        return False
    if record.is_user_confirmed:
        return True
    if record.last_occurrence is None:
        return False
    age = (today - record.last_occurrence.date()).days
    return 0 <= age <= 2 * interval_days(record.frequency) + 7


def _signed(amount: Decimal, tx_type: TransactionType) -> Decimal:
    """Money in positive, money out negative; a transfer is never a flow."""
    if tx_type == TransactionType.INCOME:
        return abs(amount)
    if tx_type == TransactionType.EXPENSE:
        return -abs(amount)
    msg = f"{tx_type.value} rows are not cash flows"
    raise ValueError(msg)


def _recurring_dates(record: RecurringTransaction, start: date, end: date) -> list[date]:
    frequency = record.frequency
    if frequency is None:
        return []
    if record.last_occurrence is not None:
        anchor = record.last_occurrence.date()
        return expand_dates(
            anchor, frequency, record.expected_day, start, end, include_anchor=False
        )
    # A commitment added by hand has no history: daily runs every day, and a
    # monthly one with a due day starts this month, as the API's next_expected does.
    if frequency == RecurrenceFrequency.DAILY:
        return expand_dates(start, frequency, None, start, end, include_anchor=True)
    if frequency == RecurrenceFrequency.MONTHLY and record.expected_day:
        anchor = month_day(start.year * 12 + start.month - 1, record.expected_day)
        return expand_dates(anchor, frequency, record.expected_day, start, end, include_anchor=True)
    return []


@dataclass(frozen=True, slots=True)
class CommitmentFlows:
    """Expanded flows plus the pattern labels of every active expense commitment."""

    flows: list[Flow]
    #: Detection labels of active expense commitments and schedules, so their
    #: ledger rows can be kept out of discretionary spend.
    expense_keys: frozenset[str]


def load_commitment_flows(
    db: Session,
    user_id: int,
    *,
    today: date,
    start: date,
    end: date,
    counts: Callable[[str], bool],
) -> CommitmentFlows:
    """Flows in ``[start, end]`` on accounts where ``counts(account)`` holds."""
    schedules = db.scalars(
        select(ScheduledTransaction).where(
            ScheduledTransaction.user_id == user_id,
            ScheduledTransaction.is_active.is_(True),
            ScheduledTransaction.type.in_(_FLOW_TYPES),
        )
    ).all()
    records = db.scalars(
        select(RecurringTransaction)
        .where(
            RecurringTransaction.user_id == user_id,
            RecurringTransaction.pattern_kind != DISMISSED_PATTERN_KIND,
            RecurringTransaction.transaction_type.in_(_FLOW_TYPES),
        )
        .options(load_user_amount())
    ).all()
    linked = {s.recurring_transaction_id for s in schedules if s.recurring_transaction_id}
    flows = list(_schedule_flows(schedules, start, end, counts))
    expense_keys = {
        key
        for schedule in schedules
        if schedule.type == TransactionType.EXPENSE
        for key in schedule_labels(schedule)
    }
    for record in records:
        commitment = record.is_active and effective_pattern_kind(record) == "commitment"
        if commitment and record.transaction_type == TransactionType.EXPENSE:
            expense_keys |= pattern_keys(record.pattern_name)
        if (
            record.id in linked
            or not counts(record.account)
            or not is_accepted_commitment(record, today)
            or any(same_commitment(schedule, record) for schedule in schedules)
        ):
            continue
        amount = _signed(effective_expected_amount(record), record.transaction_type)
        flows.extend(
            Flow(record.pattern_name, record.account, on, amount, "recurring")
            for on in _recurring_dates(record, start, end)
        )
    flows.sort(key=lambda flow: (flow.on, flow.amount))
    return CommitmentFlows(flows, frozenset(expense_keys))


def _schedule_flows(
    schedules: Iterable[ScheduledTransaction],
    start: date,
    end: date,
    counts: Callable[[str], bool],
) -> Iterable[Flow]:
    for schedule in schedules:
        if not counts(schedule.account):
            continue
        last = min(end, schedule.end_date.date()) if schedule.end_date else end
        anchor = schedule.next_due_date.date()
        amount = _signed(schedule.amount, schedule.type)
        for on in expand_dates(
            anchor, schedule.frequency, schedule.expected_day, start, last, include_anchor=True
        ):
            yield Flow(schedule.name, schedule.account, on, amount, "scheduled")

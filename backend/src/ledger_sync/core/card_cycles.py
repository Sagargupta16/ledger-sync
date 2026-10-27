"""Credit-card statement cycles from Money Manager's card days, on IST calendar dates.

Money Manager's settlement day opens a statement period: with day 15 a period
runs from the 15th to the 14th of the next month, and the 14th is the statement
date. Money is due on the first payment day after the statement date, so day 5
falls in the next month and day 28 in the same one. A day past a month's end
lands on its last day (31 is 28 February). These rules follow Realbyte's
"How to change credit card payment date" help article (updated 2026-10-16).

A statement bills what the card owed when it closed, as Money Manager's payable
balance and a bank's total amount due do: an unpaid earlier balance is carried
into it and a payment made before the close lowers it. Payments after a close
pay the oldest bill first. Only the latest statement asks for money: an older
one is paid once later payments cover it and rolled over until then, because
what it still owes is already inside the latest bill.
"""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from ledger_sync.schemas.card_cycles import CycleStatus

# Rounding slack when deciding that payments covered a bill.
PAID_TOLERANCE = Decimal("1.00")
ZERO = Decimal(0)
_ASKS_NOTHING: frozenset[CycleStatus] = frozenset({"open", "nothing_due", "paid", "rolled_over"})


@dataclass(frozen=True, slots=True)
class Movement:
    """One ledger row as it moves one card.

    ``charge`` adds to what is owed (an expense or money moved out of the card),
    ``credit`` is a refund or other income on the card, and ``payment`` is money
    moved into the card from another account.
    """

    day: date
    charge: Decimal = ZERO
    credit: Decimal = ZERO
    payment: Decimal = ZERO
    from_paying_account: bool = False


@dataclass(frozen=True, slots=True)
class Cycle:
    """One statement period. ``billed``, ``paid`` and ``carried`` stay zero while it is open.

    ``carried`` is the part of ``billed`` that earlier statements still owed
    once this period's payments were counted.
    """

    period_start: date
    statement_date: date
    due_date: date
    status: CycleStatus
    spend: Decimal
    billed: Decimal = ZERO
    paid: Decimal = ZERO
    paid_on: date | None = None
    paid_from_paying_account: bool = False
    carried: Decimal = ZERO

    @property
    def remaining(self) -> Decimal:
        """What is still to pay on this statement, never below zero."""
        if self.status in _ASKS_NOTHING:
            return ZERO
        return max(ZERO, self.billed - self.paid)


def on_day(year: int, month: int, day: int) -> date:
    """``day`` in that month, clamped to the month's last day."""
    return date(year, month, min(day, monthrange(year, month)[1]))


def shifted(anchor: date, months: int, day: int) -> date:
    """``day`` in the month ``months`` after the month of *anchor*, clamped."""
    index = anchor.year * 12 + anchor.month - 1 + months
    return on_day(index // 12, index % 12 + 1, day)


def period_start_on(today: date, statement_day: int) -> date:
    """The first day of the statement period that contains *today*."""
    start = shifted(today, 0, statement_day)
    return start if start <= today else shifted(today, -1, statement_day)


def statement_date_of(period_start: date, statement_day: int) -> date:
    """The last day of the period opened on *period_start*."""
    return shifted(period_start, 1, statement_day) - timedelta(days=1)


def due_date_after(statement_date: date, payment_day: int) -> date:
    """The first payment day after the statement date."""
    due = shifted(statement_date, 0, payment_day)
    return due if due > statement_date else shifted(statement_date, 1, payment_day)


def period_starts(today: date, statement_day: int, closed: int) -> list[date]:
    """Starts of *closed* finished periods and then the open one, oldest first."""
    current = period_start_on(today, statement_day)
    return [shifted(current, -offset, statement_day) for offset in range(closed, -1, -1)]


def build_cycles(
    today: date,
    days: tuple[int, int],
    opening_owed: Decimal,
    movements: list[Movement],
    closed: int,
) -> list[Cycle]:
    """The open period first, then *closed* statements, newest first.

    *days* is (statement day, payment day). *opening_owed* is what the card owed
    before the earliest day *movements* covers, which is no later than the oldest
    period start. Movements after *today* are left out.
    """
    statement_day, payment_day = days
    starts = period_starts(today, statement_day, closed)
    counted = [m for m in movements if m.day <= today]
    payments = sorted((m for m in counted if m.payment > 0), key=lambda m: m.day)
    owed = opening_owed + sum((_net(m) for m in counted if m.day < starts[0]), ZERO)
    cycles: list[Cycle] = []
    for index, start in enumerate(starts):
        end = statement_date_of(start, statement_day)
        due = due_date_after(end, payment_day)
        inside = [m for m in counted if start <= m.day <= end]
        spend = sum((m.charge - m.credit for m in inside), ZERO)
        if index == closed:
            cycles.append(Cycle(start, end, due, "open", spend))
            break
        carried = owed - sum((m.payment for m in inside), ZERO)
        owed = carried + spend
        later = [m for m in payments if m.day > end]
        period = (start, end, due)
        cycles.append(
            _closed_cycle(period, spend, owed, carried, later, today, latest=index == closed - 1)
        )
    return cycles[::-1]


def _net(movement: Movement) -> Decimal:
    return movement.charge - movement.credit - movement.payment


def _closed_cycle(
    period: tuple[date, date, date],
    spend: Decimal,
    owed: Decimal,
    carried: Decimal,
    later: list[Movement],
    today: date,
    *,
    latest: bool,
) -> Cycle:
    """A *period* (start, statement, due) that closed owing *owed*; *later* are payments since."""
    start, end, due = period
    billed = max(ZERO, owed)
    paid, paid_on, from_payer = _settle(billed, later)
    status = _latest_status(billed, paid, due, today) if latest else _older_status(billed, paid)
    taken_over = min(billed, max(ZERO, carried))
    return Cycle(start, end, due, status, spend, billed, paid, paid_on, from_payer, taken_over)


def _settle(billed: Decimal, payments: list[Movement]) -> tuple[Decimal, date | None, bool]:
    """What *payments* put toward *billed*, the day that covered it, and if the payer sent any."""
    if billed <= PAID_TOLERANCE:
        return ZERO, None, False
    paid = ZERO
    from_payer = False
    for movement in payments:
        paid += movement.payment
        from_payer = from_payer or movement.from_paying_account
        if paid >= billed - PAID_TOLERANCE:
            return min(paid, billed), movement.day, from_payer
    return paid, None, from_payer


def _latest_status(billed: Decimal, paid: Decimal, due: date, today: date) -> CycleStatus:
    if billed <= PAID_TOLERANCE:
        return "nothing_due"
    if paid >= billed - PAID_TOLERANCE:
        return "paid"
    if today > due:
        return "overdue"
    return "partial" if paid > 0 else "due"


def _older_status(billed: Decimal, paid: Decimal) -> CycleStatus:
    if billed <= PAID_TOLERANCE:
        return "nothing_due"
    return "paid" if paid >= billed - PAID_TOLERANCE else "rolled_over"

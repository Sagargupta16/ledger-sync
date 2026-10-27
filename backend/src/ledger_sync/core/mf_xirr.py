"""XIRR on a 365-day year, and the cash flows a CAS holding's statement rows imply.

XIRR follows Excel: the annual rate r at which the dated flows' NPV is zero, with
days divided by 365 (not 365.25). Newton's method from 10%, then bisection when
Newton leaves the range, stalls or overflows. Flows are from the investor's side: money paid
in is negative; redemptions, IDCW payouts and today's value are positive. Stamp
duty, STT and TDS rows count as money paid. A switch is a flow for each scheme
and nets out across the portfolio. IDCW reinvestment moves no money and is skipped.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from datetime import date

from ledger_sync.core.cas_records import CasTransaction

DAYS_PER_YEAR = 365
# Rows whose amount bought or sold units; the units' sign gives the direction.
_UNIT_FLOWS = frozenset(
    {
        "PURCHASE",
        "PURCHASE_SIP",
        "SWITCH_IN",
        "SWITCH_IN_MERGER",
        "SWITCH_OUT",
        "SWITCH_OUT_MERGER",
        "REDEMPTION",
        "REVERSAL",
        "GIFT_IN",
        "GIFT_OUT",
    }
)
_TAXES = frozenset({"STT_TAX", "STAMP_DUTY_TAX", "TDS_TAX"})
_PAYOUT = "DIVIDEND_PAYOUT"

type Flow = tuple[date, float]
type _TimedFlow = tuple[float, float]


def holding_flows(rows: Iterable[CasTransaction]) -> list[Flow]:
    """The investor-side cash flows of one holding's statement rows."""
    flows: list[Flow] = []
    for row in rows:
        if not row.amount:
            continue
        amount = float(abs(row.amount))
        if row.txn_type in _UNIT_FLOWS and row.units:
            flows.append((row.txn_date, -amount if row.units > 0 else amount))
        elif row.txn_type in _TAXES:
            flows.append((row.txn_date, -amount))
        elif row.txn_type == _PAYOUT:
            flows.append((row.txn_date, amount))
    return flows


def _npv(flows: Sequence[_TimedFlow], rate: float) -> float:
    return sum(amount / math.pow(1.0 + rate, years) for years, amount in flows)


def _newton(flows: Sequence[_TimedFlow]) -> float | None:
    rate = 0.1
    for _ in range(100):
        base = 1.0 + rate
        npv = sum(amount / math.pow(base, years) for years, amount in flows)
        slope = sum(-years * amount / math.pow(base, years + 1) for years, amount in flows)
        if slope == 0:
            return None
        step = npv / slope
        rate -= step
        if rate <= -1.0:
            return None
        if abs(step) < 1e-10:
            return rate
    return None


def _bisect(flows: Sequence[_TimedFlow]) -> float | None:
    low, high = -0.9999, 10.0
    low_npv, high_npv = _npv(flows, low), _npv(flows, high)
    while low_npv * high_npv > 0 and high < 1e4:
        high *= 10
        high_npv = _npv(flows, high)
    if low_npv * high_npv > 0:
        return None
    for _ in range(300):
        middle = (low + high) / 2
        middle_npv = _npv(flows, middle)
        if abs(middle_npv) < 1e-9 or high - low < 1e-12:
            return middle
        if low_npv * middle_npv < 0:
            high = middle
        else:
            low, low_npv = middle, middle_npv
    return (low + high) / 2


def xirr(flows: Sequence[Flow]) -> float | None:
    """Annual rate in percent, or None without both signs, a time span or a root."""
    if not any(amount < 0 for _, amount in flows) or not any(amount > 0 for _, amount in flows):
        return None
    start = min(day for day, _ in flows)
    timed = [((day - start).days / DAYS_PER_YEAR, amount) for day, amount in flows]
    if all(years == 0 for years, _ in timed):
        return None
    # Each solver gets its own try: on a long loss-making history Newton's first step
    # overshoots into OverflowError, and bisection must still run to bracket the root.
    for solve in (_newton, _bisect):
        try:
            rate = solve(timed)
        except OverflowError, ZeroDivisionError, ValueError:
            continue
        if rate is not None:
            return rate * 100
    return None

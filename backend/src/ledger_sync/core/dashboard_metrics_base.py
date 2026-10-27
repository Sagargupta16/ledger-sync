"""The ledger rows and the JavaScript-parity arithmetic the Dashboard metric ports share.

The ports return the browser's answer to the last bit on the same rows, so floats
are added left to right in ledger order (``sum()`` compensates since Python 3.12,
so it would differ), halves round up like ``Math.round``, and object keys are
visited in the order a JavaScript object iterates them.
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterable, Sequence
from datetime import datetime
from fractions import Fraction
from functools import cache
from typing import NamedTuple


class FlowRow(NamedTuple):
    """The columns of a live row the window figures read: no labels, no note."""

    date: datetime
    amount: float
    type: str
    from_account: str | None
    to_account: str | None


class LedgerRow(NamedTuple):
    """One live ledger row as ``/api/transactions/all`` serialises it."""

    date: datetime
    amount: float
    type: str
    category: str
    subcategory: str
    from_account: str | None
    to_account: str | None
    note: str


def js_round(value: float) -> int:
    """``Math.round``: a half rounds toward +infinity, where ``round()`` rounds to even."""
    floor = math.floor(value)
    return floor + 1 if value - floor >= 0.5 else floor


_ARRAY_INDEX = re.compile(r"0|[1-9][0-9]*")


def js_key_order(keys: Iterable[str]) -> list[str]:
    """Keys in the order a JavaScript object holding them iterates.

    Integer-like keys come first in numeric order and every other key keeps its
    insertion order. Balance totals are float sums, so the order is part of the
    result.
    """
    ordered = list(keys)
    indices = sorted(
        (key for key in ordered if _ARRAY_INDEX.fullmatch(key) and int(key) < 2**32 - 1),
        key=int,
    )
    seen = set(indices)
    return indices + [key for key in ordered if key not in seen]


def running_sum(values: Iterable[float]) -> float:
    """Left-to-right ``+``, as ``Array.reduce`` adds."""
    total = 0.0
    for value in values:
        total += value
    return total


def savings_rate_percent(income: float, expense: float) -> float:
    """``savingsRatePercentOr``: (income - expense) / income, 0 without income."""
    return ((income - expense) / income) * 100 if income > 0 else 0.0


def share_percent(flow: float, income: float, fallback: float) -> float:
    """``shareOfIncomePercent``: one flow as a share of income, *fallback* without income."""
    return (flow / income) * 100 if income > 0 else fallback


# Income stability and savings volatility read the last 12 analysed months
# (``VOLATILITY_WINDOW`` in ``computeAnalysis``).
VOLATILITY_MONTHS = 12


@cache
def _recency_weight(steps_back: int) -> float:
    """``Math.pow(0.9, k)``: the weight of the value *steps_back* months before the newest.

    The correctly rounded power, which is what V8 returns for every k up to 23
    (checked), so it does not depend on the platform's libm.
    """
    return float(Fraction(0.9) ** steps_back)


def weighted_cv(values: Sequence[float]) -> float:
    """``weightedCoefficientOfVariation`` in percent, oldest value first."""
    if not values:
        return 0.0
    weights = [_recency_weight(len(values) - 1 - index) for index in range(len(values))]
    weight_sum = running_sum(weights)
    mean = running_sum(v * w for v, w in zip(values, weights, strict=True)) / weight_sum
    if mean == 0:
        return 0.0
    spread = running_sum(
        w * ((v - mean) * (v - mean)) for v, w in zip(values, weights, strict=True)
    )
    return (math.sqrt(spread / weight_sum) / abs(mean)) * 100

"""Window figures for the Dashboard pulse: Age of Money, Days of Buffering, transfers.

Ports of ``frontend/src/lib/ageOfMoneyCalculator.ts`` and
``summarizeInvestmentTransfers`` (``frontend/src/lib/finance/investmentFlows.ts``)
that return the browser's answer to the last bit on the same rows; see
``dashboard_metrics_base`` for the arithmetic rules that takes.
"""

from __future__ import annotations

import math
import re
from collections import deque
from collections.abc import Iterable, Mapping, Sequence
from collections.abc import Set as AbstractSet
from datetime import date, datetime, timedelta

from ledger_sync.core.dashboard_metrics_base import FlowRow, js_key_order, js_round
from ledger_sync.core.metric_rules import is_investment_account

_MS_PER_DAY = 86_400_000
_SPENDABLE_TYPES = frozenset({"Cash", "Bank Accounts", "Other Wallets"})

# JavaScript's ``\s``. The frontend patterns carry no ``u`` flag, so their ``\b``
# and case folding are ASCII-only, which ``re.ASCII`` reproduces.
_JS_SPACE = r"[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]"
_PARKED_DEPOSITS = tuple(
    re.compile(pattern.replace(r"\s", _JS_SPACE), re.IGNORECASE | re.ASCII)
    for pattern in (
        r"\bsecurity\s+deposits?\b",
        r"\brent(?:al)?\s+deposits?\b",
        r"\bcaution\s+(?:money|deposits?)\b",
        r"\bescrow\b",
        r"^\s*deposits?\s*\Z",
    )
)


def is_spendable(name: str, classifications: Mapping[str, str]) -> bool:
    """Cash, bank and wallet accounts, minus deposits a third party holds."""
    if classifications.get(name) not in _SPENDABLE_TYPES:
        return False
    return not any(pattern.search(name) for pattern in _PARKED_DEPOSITS)


def net_liquid(balances: Mapping[str, float], classifications: Mapping[str, str]) -> float:
    """``computeLiquidPosition(...).netLiquid``: spendable money less what is owed."""
    gross = 0.0
    owed = 0.0
    for name in js_key_order(balances):
        balance = balances[name]
        if not math.isfinite(balance) or balance == 0:
            continue
        if classifications.get(name) == "Credit Cards":
            if balance < 0:
                owed += -balance
            continue
        if not is_spendable(name, classifications):
            continue
        if balance > 0:
            gross += balance
        else:
            owed += -balance
    return max(0.0, gross - owed)


def _epoch_ms(moment: datetime) -> int:
    """``new Date(iso).getTime()`` up to a constant: whole milliseconds, floored.

    The stored value is a naive IST wall clock and IST has no DST, so the
    difference of two of these is the browser's difference in India.
    """
    seconds = moment.toordinal() * 86_400 + moment.hour * 3_600 + moment.minute * 60
    return (seconds + moment.second) * 1_000 + moment.microsecond // 1_000


def _dequeue(queue: deque[list[float]], amount: float, when: int) -> tuple[float, float]:
    """Spend *amount* from the oldest buckets; the amount-weighted age sum and the match."""
    remaining = amount
    age_sum = 0.0
    matched = 0.0
    while remaining > 0 and queue:
        bucket = queue[0]
        take = min(remaining, bucket[1])
        age_sum += take * max(0.0, (when - bucket[0]) / _MS_PER_DAY)
        matched += take
        bucket[1] -= take
        remaining -= take
        if bucket[1] <= 0:
            queue.popleft()
    return age_sum, matched


def _transfer_direction(row: FlowRow, classifications: Mapping[str, str]) -> str:
    """Whether a transfer leaves the spendable pool, re-enters it, or stays inside."""
    if not row.from_account or not row.to_account:
        return "out"
    from_cash = is_spendable(row.from_account, classifications)
    to_cash = is_spendable(row.to_account, classifications)
    if from_cash and not to_cash:
        return "out"
    if to_cash and not from_cash:
        return "in"
    return "none"


def age_of_money(rows: Sequence[FlowRow], classifications: Mapping[str, str]) -> int | None:
    """FIFO age in days of the money spent in *rows*, or None with no matched spend."""
    queue: deque[list[float]] = deque()
    age_sum = 0.0
    matched = 0.0
    # Stable, like the browser's sort on the ISO string: same-day rows keep ledger order.
    for row in sorted(rows, key=lambda r: r.date):
        amount = abs(row.amount)
        when = _epoch_ms(row.date)
        if row.type == "Income":
            queue.append([when, amount])
        elif row.type == "Expense":
            row_age, row_matched = _dequeue(queue, amount, when)
            age_sum += row_age
            matched += row_matched
        elif row.type == "Transfer":
            direction = _transfer_direction(row, classifications)
            if direction == "out":
                _dequeue(queue, amount, when)
            elif direction == "in":
                queue.append([when, amount])
    if matched == 0:
        return None
    return js_round(age_sum / matched)


def days_of_buffering(
    liquid: float, rows: Iterable[FlowRow], today: date, lookback_days: int = 90
) -> int | None:
    """Days *liquid* lasts at the mean daily spend of the trailing window in *rows*."""
    cutoff = today - timedelta(days=lookback_days - 1)
    spend = 0.0
    earliest: date | None = None
    for row in rows:
        day = row.date.date()
        if row.type != "Expense" or day < cutoff or day > today:
            continue
        amount = abs(row.amount)
        if not math.isfinite(amount):
            continue
        spend += amount
        if earliest is None or day < earliest:
            earliest = day
    if earliest is None or spend <= 0:
        return None
    mean = spend / max(1, (today - earliest).days + 1)
    if not math.isfinite(liquid) or not math.isfinite(mean) or mean <= 0:
        return None
    return max(0, js_round(liquid / mean))


def investment_transfers(
    rows: Iterable[FlowRow], mapped_names: AbstractSet[str]
) -> dict[str, float]:
    """Transfer volume split into contributions, withdrawals, internal and other moves."""
    contributions = 0.0
    withdrawals = 0.0
    internal = 0.0
    other = 0.0
    for row in rows:
        if row.type != "Transfer":
            continue
        to_investment = is_investment_account(row.to_account, mapped_names)
        from_investment = is_investment_account(row.from_account, mapped_names)
        delta = row.amount * (int(to_investment) - int(from_investment))
        if delta > 0:
            contributions += delta
        elif delta < 0:
            withdrawals -= delta
        elif from_investment and to_investment:
            internal += row.amount
        else:
            other += row.amount
    return {
        "contributions": contributions,
        "withdrawals": withdrawals,
        "net_contributions": contributions - withdrawals,
        "internal_transfers": internal,
        "other_transfers": other,
    }

"""Day-by-day balance projection for every spendable account.

Each account starts from today's balance. Every day it gains or loses the
commitments and schedules dated that day, its usual net transfers, and its
share of the average daily discretionary spend. Flows that cannot be placed on
an account (a commitment added by hand, an unclassified label) move only the
total. Card charges are left out: a card is paid later from a bank account,
and that card bill is one of the transfers the usual net already carries.

Flags are crossings: an account is flagged the first day it falls below zero,
or below the user's threshold, having started at or above it. A wallet that
always holds less than the threshold is not news; one already overdrawn is
reported as ``starts_below_zero`` instead.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from ledger_sync.core.safe_to_spend_flows import Flow
from ledger_sync.core.safe_to_spend_ledger import AccountPool

BreachKind = Literal["below_zero", "below_threshold"]
_ZERO = Decimal(0)


@dataclass(frozen=True, slots=True)
class Series:
    """One account's (or the total's) end-of-day balances from today."""

    name: str
    start_balance: Decimal
    balances: list[Decimal]
    daily_spend: Decimal
    daily_transfer: Decimal
    lowest: Decimal
    lowest_on: date
    below_zero_on: date | None
    below_threshold_on: date | None
    starts_below_zero: bool

    def crossings(self) -> list[tuple[date, BreachKind]]:
        found: list[tuple[date, BreachKind]] = []
        if self.below_zero_on:
            found.append((self.below_zero_on, "below_zero"))
        if self.below_threshold_on:
            found.append((self.below_threshold_on, "below_threshold"))
        return found


@dataclass(frozen=True, slots=True)
class Projection:
    dates: list[date]
    accounts: list[Series]
    total: Series
    unassigned_flows: int

    def first_breach(self) -> tuple[Series, date, BreachKind] | None:
        """The earliest crossing on any account, else on the total; zero before threshold."""
        for group in (self.accounts, [self.total]):
            hits = [(on, kind, series) for series in group for on, kind in series.crossings()]
            if hits:
                on, kind, series = min(hits, key=lambda hit: (hit[0], hit[1] != "below_zero"))
                return series, on, kind
        return None


def _series(
    name: str,
    start: Decimal,
    balances: list[Decimal],
    dates: list[date],
    threshold: Decimal,
    rates: tuple[Decimal, Decimal],
) -> Series:
    def crossing(level: Decimal) -> date | None:
        if start < level:
            return None
        return next((on for on, value in zip(dates, balances, strict=True) if value < level), None)

    low = min(range(len(balances)), key=balances.__getitem__)
    return Series(
        name=name,
        start_balance=start,
        balances=balances,
        daily_spend=rates[0],
        daily_transfer=rates[1],
        lowest=balances[low],
        lowest_on=dates[low],
        below_zero_on=crossing(_ZERO),
        below_threshold_on=crossing(threshold) if threshold > 0 else None,
        starts_below_zero=start < 0,
    )


def project_balances(
    start_balances: dict[str, Decimal],
    flows: Iterable[Flow],
    *,
    spend: dict[str, Decimal],
    transfers: dict[str, Decimal],
    pool: AccountPool,
    today: date,
    days: int,
    threshold: Decimal,
) -> Projection:
    """Project ``days`` end-of-day balances; flows dated before today land today."""
    dates = [today + timedelta(days=i) for i in range(days)]
    labels = {name.lower(): name for name in start_balances}
    placed: dict[str, dict[date, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    unassigned: dict[date, Decimal] = defaultdict(Decimal)
    unassigned_count = 0
    for flow in flows:
        if flow.on > dates[-1]:
            continue
        on = max(flow.on, today)
        role = pool.role(flow.account)
        if role == "spendable":
            placed[labels.get(flow.account.lower(), flow.account)][on] += flow.amount
        elif role == "unclassified":
            unassigned[on] += flow.amount
            unassigned_count += 1
    names = sorted(
        {
            name
            for name, balance in start_balances.items()
            if pool.role(name) == "spendable"
            and (balance or spend.get(name) or transfers.get(name))
        }
        | set(placed)
    )
    accounts = []
    for name in names:
        rates = (spend.get(name, _ZERO), transfers.get(name, _ZERO))
        balance = start_balances.get(name, _ZERO)
        points = []
        for on in dates:
            balance += placed[name].get(on, _ZERO) + rates[1] - rates[0]
            points.append(balance)
        accounts.append(
            _series(name, start_balances.get(name, _ZERO), points, dates, threshold, rates)
        )
    total_start = sum((series.start_balance for series in accounts), _ZERO)
    running = _ZERO
    total_points = []
    for i, on in enumerate(dates):
        running += unassigned.get(on, _ZERO)
        total_points.append(sum((series.balances[i] for series in accounts), running))
    total_rates = (
        sum((series.daily_spend for series in accounts), _ZERO),
        sum((series.daily_transfer for series in accounts), _ZERO),
    )
    total = _series("Total", total_start, total_points, dates, threshold, total_rates)
    return Projection(dates, accounts, total, unassigned_count)

"""Safe to spend until payday, and the balance projection behind its warning.

    safe to spend = liquid money (cash, bank and wallets, net of card dues)
                    - commitments and schedules due before the next payday
                    - a reserve for later bills the following paychecks cannot cover

The cycle runs from the last payday up to the next one, using the stored
payday preference; with no preferences row it runs to the month end, which is
also what payday 1 means. Bills count from the day after the newest imported
row (or today, if sooner) within this cycle, so a stale import still subtracts
the bills it has not seen. Money expected in before payday is never counted.

The reserve looks three cycles past payday: each paycheck (recurring income)
pays that cycle's bills, a surplus carries forward, and the deepest running
shortfall is held back now. With no recurring income there is nothing to plan
against, so nothing is reserved and the status says so.
"""

from __future__ import annotations

import calendar
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from sqlalchemy.orm import Session

from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.core.safe_to_spend_flows import CommitmentFlows, Flow, load_commitment_flows
from ledger_sync.core.safe_to_spend_ledger import (
    AccountPool,
    balances_through,
    discretionary_spend,
    latest_row_date,
    load_pool,
    mean_daily,
    transfer_rates,
)
from ledger_sync.core.safe_to_spend_projection import Projection, project_balances
from ledger_sync.core.safe_to_spend_report import (
    build_projection_response,
    build_safe_to_spend_response,
)
from ledger_sync.db.models import User
from ledger_sync.schemas.safe_to_spend import BalanceProjectionResponse, SafeToSpendResponse

LOOKBACK_DAYS = 90
RESERVE_CYCLES = 3
TRANSFER_MONTHS = 3
WARNING_DAYS = 30
_ZERO = Decimal(0)

ReserveStatus = Literal["covered", "reserved", "no_recurring_income"]


def _payday_in(month_index: int, payday: int) -> date:
    year, month0 = divmod(month_index, 12)
    return date(year, month0 + 1, min(payday, calendar.monthrange(year, month0 + 1)[1]))


def pay_cycle(today: date, payday: int) -> tuple[date, date]:
    """``(start, next_payday)`` of the cycle holding today; payday 31 means each month's end."""
    index = today.year * 12 + today.month - 1
    this = _payday_in(index, payday)
    if today >= this:
        return this, _payday_in(index + 1, payday)
    return _payday_in(index - 1, payday), this


def _following(day: date, payday: int) -> date:
    """The payday in the month after ``day``'s."""
    return _payday_in(day.year * 12 + day.month, payday)


def _month_keys(last: date, count: int) -> list[str]:
    """The ``count`` whole calendar months before the month of ``last``."""
    index = last.year * 12 + last.month - 1
    return [f"{i // 12:04d}-{i % 12 + 1:02d}" for i in range(index - count, index)]


@dataclass(frozen=True, slots=True)
class Context:
    """Everything both endpoints read from the ledger, loaded once."""

    today: date
    #: The stored preference, None when the user has no preferences row.
    payday: int | None
    #: The payday the cycle uses: the stored one, else 1 (the month end).
    cycle_payday: int
    cycle: tuple[date, date]
    balance_as_of: date | None
    pool: AccountPool
    balances: dict[str, Decimal]
    commitments: CommitmentFlows
    spend: dict[date, dict[str, Decimal]]
    spend_window: tuple[date, date] | None
    month_keys: list[str]
    rates: dict[str, Decimal]


def load_context(db: Session, user: User, today: date, horizon_end: date) -> Context:
    stored = user.preferences.payday if user.preferences else None
    payday = min(max(stored or 1, 1), 31)
    cycle = pay_cycle(today, payday)
    pool = load_pool(db, user.id)
    as_of = latest_row_date(db, user, today)
    start = max(min(as_of + timedelta(days=1), today), cycle[0]) if as_of else today
    reserve_end = cycle[1]
    for _ in range(RESERVE_CYCLES):
        reserve_end = _following(reserve_end, payday)
    commitments = load_commitment_flows(
        db,
        user.id,
        today=today,
        start=start,
        end=max(horizon_end, reserve_end - timedelta(days=1)),
        counts=pool.counts_for_cash,
    )
    spend: dict[date, dict[str, Decimal]] = {}
    month_keys: list[str] = []
    rates: dict[str, Decimal] = {}
    if as_of:
        lookback = as_of - timedelta(days=LOOKBACK_DAYS - 1)
        spend = discretionary_spend(
            db, user, lookback, as_of, recurring_keys=commitments.expense_keys, pool=pool
        )
        month_keys = _month_keys(as_of, TRANSFER_MONTHS)
        rates = transfer_rates(db, user, month_keys, pool)
    return Context(
        today=today,
        payday=stored,
        cycle_payday=payday,
        cycle=cycle,
        balance_as_of=as_of,
        pool=pool,
        balances=balances_through(db, user, today),
        commitments=commitments,
        spend=spend,
        spend_window=(min(spend), as_of) if spend and as_of else None,
        month_keys=month_keys,
        rates=rates,
    )


def spendable_burn(ctx: Context) -> tuple[Decimal, dict[str, Decimal]]:
    """Average daily spend from spendable accounts, shared out by each one's spend.

    The average (total over the days observed), not the median: balances fall
    by everything spent, big days included, and on a skewed ledger the median
    day leaves most of it out. The median stays the card's "typical day".

    Only accounts holding money today take a share: spending cannot come out of
    an empty wallet, so its usual share falls on the funded accounts (by their
    own spend, else by balance). Without this an emptied wallet read as going
    below zero on day one.
    """
    if ctx.spend_window is None:
        return _ZERO, {}

    def spendable(account: str) -> bool:
        return ctx.pool.role(account) == "spendable"

    burn = mean_daily(ctx.spend, *ctx.spend_window, spendable)
    shares: dict[str, Decimal] = defaultdict(Decimal)
    for day in ctx.spend.values():
        for account, amount in day.items():
            if spendable(account):
                shares[account] += amount
    funded = {name: amount for name, amount in shares.items() if ctx.balances.get(name, _ZERO) > 0}
    weights = funded or {
        name: balance for name, balance in ctx.balances.items() if balance > 0 and spendable(name)
    }
    total = sum(weights.values(), _ZERO)
    if not total:
        return burn, {}
    return burn, {name: burn * weight / total for name, weight in weights.items()}


def projection_for(ctx: Context, days: int, threshold: Decimal) -> tuple[Projection, Decimal]:
    """The projection over ``days``, with the daily burn it assumed."""
    burn, per_account = spendable_burn(ctx)
    projection = project_balances(
        ctx.balances,
        ctx.commitments.flows,
        spend=per_account,
        transfers=ctx.rates,
        pool=ctx.pool,
        today=ctx.today,
        days=days,
        threshold=threshold,
    )
    return projection, burn


@dataclass(frozen=True, slots=True)
class Reserve:
    amount: Decimal
    status: ReserveStatus
    #: ``(first day, last day, income, bills)`` of each cycle after payday.
    cycles: list[tuple[date, date, Decimal, Decimal]]


def reserve_for_later_bills(flows: list[Flow], next_payday: date, payday: int) -> Reserve:
    """Deepest running shortfall of paychecks against bills over the next cycles."""
    cycles = []
    running = reserve = _ZERO
    start = next_payday
    for _ in range(RESERVE_CYCLES):
        end = _following(start, payday)
        inside = [flow.amount for flow in flows if start <= flow.on < end]
        income = sum((amount for amount in inside if amount > 0), _ZERO)
        bills = -sum((amount for amount in inside if amount < 0), _ZERO)
        running += income - bills
        reserve = max(reserve, -running)
        cycles.append((start, end - timedelta(days=1), income, bills))
        start = end
    if not any(cycle[2] > 0 for cycle in cycles):
        return Reserve(_ZERO, "no_recurring_income", cycles)
    return Reserve(reserve, "reserved" if reserve > 0 else "covered", cycles)


def safe_to_spend(db: Session, user: User, threshold: Decimal) -> SafeToSpendResponse:
    today = ledger_today()
    ctx = load_context(db, user, today, today + timedelta(days=WARNING_DAYS - 1))
    reserve = reserve_for_later_bills(ctx.commitments.flows, ctx.cycle[1], ctx.cycle_payday)
    projection, _ = projection_for(ctx, WARNING_DAYS, threshold)
    return build_safe_to_spend_response(ctx, reserve, projection, threshold)


def balance_projection(
    db: Session, user: User, days: int, threshold: Decimal
) -> BalanceProjectionResponse:
    today = ledger_today()
    ctx = load_context(db, user, today, today + timedelta(days=days - 1))
    projection, burn = projection_for(ctx, days, threshold)
    return build_projection_response(ctx, projection, burn, threshold, LOOKBACK_DAYS)

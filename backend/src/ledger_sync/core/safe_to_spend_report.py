"""Shape the safe-to-spend computation into its API responses.

Kept apart from ``safe_to_spend`` so the arithmetic there reads on its own;
everything here is presentation: rounding to paise, picking the listed bills,
the pace against an even spend through the cycle, and the projection series.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from ledger_sync.core.safe_to_spend_ledger import median_daily
from ledger_sync.schemas.safe_to_spend import (
    AccountSeriesOut,
    BalanceProjectionResponse,
    FlowOut,
    LiquidOut,
    LowBalanceOut,
    PaceOut,
    PayCycleOut,
    ProjectionAssumptionsOut,
    ReserveCycleOut,
    ReserveOut,
    SafeToSpendResponse,
)

if TYPE_CHECKING:
    from ledger_sync.core.safe_to_spend import Context, Reserve
    from ledger_sync.core.safe_to_spend_flows import Flow
    from ledger_sync.core.safe_to_spend_projection import Projection, Series

BILLS_LISTED = 12
EVENTS_LISTED = 40
_ZERO = Decimal(0)
_PAISE = Decimal("0.01")


def money(value: Decimal) -> float:
    return float(value.quantize(_PAISE))


def _flow_out(flow: Flow, on: date | None = None) -> FlowOut:
    return FlowOut(
        name=flow.name, account=flow.account, date=on or flow.on, amount=money(flow.amount)
    )


def _liquid(ctx: Context) -> tuple[LiquidOut, Decimal]:
    """Mirror of ``computeLiquidPosition``: a negative balance is debt wherever it sits.

    One difference: a closed account's positive balance is not cash to spend,
    while its debt, like a closed card's dues, is still owed.
    """
    gross = liabilities = _ZERO
    counts: Counter[str] = Counter()
    for name, balance in ctx.balances.items():
        role = ctx.pool.role(name)
        if balance:
            counts[role] += 1
        if role == "spendable" and balance > 0:
            gross += balance
        elif balance < 0 and ctx.pool.classified_role(name) in ("spendable", "card"):
            liabilities -= balance
    net = gross - liabilities
    out = LiquidOut(
        gross=money(gross),
        liabilities=money(liabilities),
        net=money(net),
        spendable_accounts=counts["spendable"],
        card_accounts=counts["card"],
        unclassified_accounts=counts["unclassified"],
    )
    return out, net


def _detected_payday(flows: list[Flow]) -> int | None:
    """Usual day of the income bringing in the most money, if it repeats.

    Schedules count as well as commitments: a salary schedule replaces the
    commitment detected from the same rows, and its day is the same answer.
    """
    totals: dict[str, Decimal] = defaultdict(Decimal)
    days: dict[str, list[int]] = defaultdict(list)
    for flow in flows:
        if flow.amount > 0:
            totals[flow.name] += flow.amount
            days[flow.name].append(flow.on.day)
    if not totals:
        return None
    name = max(totals, key=totals.__getitem__)
    return max(days[name]) if len(days[name]) >= 2 else None


def _spent(ctx: Context, first: date, last: date) -> Decimal:
    """Discretionary spend on spendable and card accounts over ``[first, last]``."""
    return sum(
        (
            amount
            for day, accounts in ctx.spend.items()
            if first <= day <= last
            for account, amount in accounts.items()
            if ctx.pool.role(account) in ("spendable", "card")
        ),
        _ZERO,
    )


def _pace(ctx: Context, safe: Decimal) -> PaceOut | None:
    """Spend so far against the cycle's allowance spread evenly over its days.

    ``usual`` is the habit view of the same day: the average day of the
    lookback (a mean, since it sums to a total) times the days elapsed.
    """
    start, next_payday = ctx.cycle
    if ctx.balance_as_of is None or ctx.balance_as_of < start:
        return None
    as_of = min(ctx.balance_as_of, ctx.today)
    spent = _spent(ctx, start, as_of)
    total_days = (next_payday - start).days
    elapsed = (as_of - start).days + 1
    budget = spent + max(safe, _ZERO)
    usual = None
    if ctx.spend_window:
        first, last = ctx.spend_window
        usual = money(_spent(ctx, first, last) / ((last - first).days + 1) * elapsed)
    return PaceOut(
        spent=money(spent),
        expected=money(budget * elapsed / total_days),
        budget=money(budget),
        usual=usual,
        elapsed_days=elapsed,
        total_days=total_days,
        as_of=as_of,
    )


def build_safe_to_spend_response(
    ctx: Context, reserve: Reserve, projection: Projection, threshold: Decimal
) -> SafeToSpendResponse:
    start, next_payday = ctx.cycle
    liquid, net = _liquid(ctx)
    flows = ctx.commitments.flows
    bills = [flow for flow in flows if flow.amount < 0 and flow.on < next_payday]
    bills_total = -sum((flow.amount for flow in bills), _ZERO)
    safe = net - bills_total - reserve.amount
    days_left = (next_payday - ctx.today).days
    typical = (
        median_daily(
            ctx.spend,
            *ctx.spend_window,
            lambda account: ctx.pool.role(account) in ("spendable", "card"),
        )
        if ctx.spend_window
        else _ZERO
    )
    breach = projection.first_breach()
    return SafeToSpendResponse(
        as_of=ctx.today,
        balance_as_of=ctx.balance_as_of,
        threshold=money(threshold),
        cycle=PayCycleOut(
            start=start,
            next_payday=next_payday,
            days_left=days_left,
            total_days=(next_payday - start).days,
            payday=ctx.payday,
            basis="month_end" if ctx.cycle_payday == 1 else "payday",
            detected_payday=_detected_payday(flows),
        ),
        liquid=liquid,
        bills_before_payday=money(bills_total),
        bill_count=len(bills),
        bills=[_flow_out(flow) for flow in bills[:BILLS_LISTED]],
        reserve=ReserveOut(
            amount=money(reserve.amount),
            status=reserve.status,
            cycles=[
                ReserveCycleOut(start=a, end=b, income=money(income), bills=money(due))
                for a, b, income, due in reserve.cycles
            ],
        ),
        safe_to_spend=money(safe),
        per_day=money(max(safe, _ZERO) / days_left),
        typical_daily_spend=money(typical),
        pace=_pace(ctx, safe),
        low_balance=(
            LowBalanceOut(
                account=breach[0].name,
                date=breach[1],
                balance=money(breach[0].balances[(breach[1] - ctx.today).days]),
                kind=breach[2],
            )
            if breach
            else None
        ),
    )


def _series_out(series: Series) -> AccountSeriesOut:
    return AccountSeriesOut(
        name=series.name,
        start_balance=money(series.start_balance),
        balances=[money(value) for value in series.balances],
        lowest=money(series.lowest),
        lowest_on=series.lowest_on,
        below_zero_on=series.below_zero_on,
        below_threshold_on=series.below_threshold_on,
        starts_below_zero=series.starts_below_zero,
        daily_spend=money(series.daily_spend),
        daily_transfer=money(series.daily_transfer),
    )


def _flag_order(series: Series) -> tuple[date, Decimal]:
    flags = [on for on in (series.below_zero_on, series.below_threshold_on) if on]
    return min(flags, default=date.max), -series.start_balance


def build_projection_response(
    ctx: Context, projection: Projection, burn: Decimal, threshold: Decimal, lookback_days: int
) -> BalanceProjectionResponse:
    last = projection.dates[-1]
    moving = [
        flow
        for flow in ctx.commitments.flows
        if flow.on <= last and ctx.pool.role(flow.account) in ("spendable", "unclassified")
    ]
    return BalanceProjectionResponse(
        as_of=ctx.today,
        balance_as_of=ctx.balance_as_of,
        days=len(projection.dates),
        threshold=money(threshold),
        dates=projection.dates,
        total=_series_out(projection.total),
        accounts=[_series_out(series) for series in sorted(projection.accounts, key=_flag_order)],
        events=[_flow_out(flow, max(flow.on, ctx.today)) for flow in moving[:EVENTS_LISTED]],
        assumptions=ProjectionAssumptionsOut(
            lookback_days=lookback_days,
            daily_spend=money(burn),
            transfer_months=ctx.month_keys,
            unassigned_flows=projection.unassigned_flows,
        ),
    )

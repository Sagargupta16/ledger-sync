"""Spending movers and the net-worth change for the weekly recap.

One grouped query reads the recap week together with its baseline weeks, and
the groups are folded here so a classified realised loss leaves spending but
still lowers net worth (``core/expense_class``), the split every spend total
and ``/daily-net-worth`` already make.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ledger_sync.core.expense_class import is_capital_loss
from ledger_sync.core.query_helpers import (
    build_transaction_query,
    capital_loss_keys_for,
    expense_sum_col,
    income_sum_col,
)
from ledger_sync.db.models import Transaction, TransactionType, User
from ledger_sync.schemas.weekly_recap import (
    CategoryMover,
    FlowKind,
    NetWorthDriver,
    RecapNetWorth,
    RecapSpending,
)

TOP_MOVERS = 5
_ZERO = Decimal(0)
_PAISA = Decimal("0.01")


def day_start(day: date) -> datetime:
    """Midnight opening *day*, naive like the stored IST ``Transaction.date``."""
    return datetime.combine(day, time.min)


def _paise(value: Decimal) -> Decimal:
    """Round half up to paise, as the ingest normalizer rounds every amount."""
    return value.quantize(_PAISA, rounding=ROUND_HALF_UP)


def money(value: Decimal) -> float:
    return float(_paise(value))


def percent(change: Decimal, base: Decimal) -> float | None:
    """Change as a percentage of a positive base; ``None`` without one."""
    if base <= 0:
        return None
    return float((change / base * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def _decimal(value: object) -> Decimal:
    # SQLite can hand a SUM back as float; str() keeps the paise exact.
    return value if isinstance(value, Decimal) else Decimal(str(value or 0))


@dataclass
class WeekFlows:
    """The recap week's flows plus per-category baseline spending."""

    income: Decimal = _ZERO
    #: Every expense row, classified realised losses included.
    expenses: Decimal = _ZERO
    spend_week: defaultdict[str, Decimal] = field(default_factory=lambda: defaultdict(Decimal))
    spend_baseline: defaultdict[str, Decimal] = field(default_factory=lambda: defaultdict(Decimal))
    #: Signed effect on net worth per (flow, category): income +, expense -.
    contributions: defaultdict[tuple[FlowKind, str], Decimal] = field(
        default_factory=lambda: defaultdict(Decimal)
    )


def load_week_flows(
    db: Session, user: User, *, week_start: date, week_end: date, baseline_start: date
) -> WeekFlows:
    """Sum income and expense rows per category, split into week and baseline."""
    base = (
        build_transaction_query(db, user, day_start(baseline_start), day_start(week_end))
        .filter(Transaction.type.in_((TransactionType.INCOME, TransactionType.EXPENSE)))
        .subquery()
    )
    in_week = base.c.date >= day_start(week_start)
    rows = (
        db.query(
            base.c.type,
            base.c.category,
            base.c.subcategory,
            func.coalesce(func.sum(case((in_week, base.c.amount), else_=0)), 0),
            func.coalesce(func.sum(case((in_week, 0), else_=base.c.amount)), 0),
        )
        .group_by(base.c.type, base.c.category, base.c.subcategory)
        .all()
    )
    loss_keys = capital_loss_keys_for(user)
    flows = WeekFlows()
    for txn_type, category, subcategory, week_sum, baseline_sum in rows:
        week = _decimal(week_sum)
        if txn_type == TransactionType.INCOME:
            flows.income += week
            flows.contributions["Income", category] += week
            continue
        flows.expenses += week
        flows.contributions["Expense", category] -= week
        if not is_capital_loss(category, subcategory, loss_keys):
            flows.spend_week[category] += week
            flows.spend_baseline[category] += _decimal(baseline_sum)
    return flows


def spending_summary(flows: WeekFlows, weeks: int) -> RecapSpending:
    this_week = sum(flows.spend_week.values(), _ZERO)
    if weeks == 0:
        return RecapSpending(
            this_week=money(this_week), weekly_average=None, change=None, change_pct=None
        )
    average = sum(flows.spend_baseline.values(), _ZERO) / weeks
    change = this_week - average
    return RecapSpending(
        this_week=money(this_week),
        weekly_average=money(average),
        change=money(change),
        change_pct=percent(change, average),
    )


def top_movers(flows: WeekFlows, weeks: int) -> list[CategoryMover]:
    """Categories spent on in the week, ranked by how far they moved from their average.

    Rises and falls rank together; ties fall back to the category name so the
    same ledger always lists the same movers. A category with no spending in
    the week is left out: a monthly bill would otherwise read as a 100% fall in
    three weeks out of four. Without a baseline the average is zero and each
    mover reads as new spending.
    """
    movers: list[CategoryMover] = []
    for category in sorted(flows.spend_week):
        this_week = flows.spend_week[category]
        if _paise(this_week) == 0:
            continue
        average = flows.spend_baseline.get(category, _ZERO) / weeks if weeks else _ZERO
        change = this_week - average
        if _paise(change) == 0:
            continue
        movers.append(
            CategoryMover(
                category=category,
                this_week=money(this_week),
                weekly_average=money(average),
                change=money(change),
                change_pct=percent(change, average),
            )
        )
    movers.sort(key=lambda mover: -abs(mover.change))
    return movers[:TOP_MOVERS]


def _biggest_driver(contributions: dict[tuple[FlowKind, str], Decimal]) -> NetWorthDriver | None:
    ranked = sorted(
        (item for item in contributions.items() if _paise(item[1]) != 0),
        key=lambda item: (-abs(item[1]), item[0]),
    )
    if not ranked:
        return None
    (kind, category), amount = ranked[0]
    return NetWorthDriver(category=category, type=kind, amount=money(amount))


def net_worth_change(db: Session, user: User, flows: WeekFlows, week_start: date) -> RecapNetWorth:
    """Opening book value before the week, then the week's net flow on top."""
    opening = (
        build_transaction_query(db, user)
        .filter(Transaction.date < day_start(week_start))
        .subquery()
    )
    row = db.query(
        income_sum_col(opening, label="income"),
        # No loss keys: a realised loss still left the books.
        expense_sum_col(opening, label="expense"),
    ).one()
    start = _decimal(row.income) - _decimal(row.expense)
    change = flows.income - flows.expenses
    return RecapNetWorth(
        start=money(start),
        end=money(start + change),
        change=money(change),
        income=money(flows.income),
        expenses=money(flows.expenses),
        driver=_biggest_driver(flows.contributions),
    )

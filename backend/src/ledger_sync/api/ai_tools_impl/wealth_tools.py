"""Net worth over time and investment holdings, for wealth history charts.

Stored values only: no tool here calls the network. The CAS holdings keep the
NAV of their statement (Investment Analytics refreshes them to AMFI's latest),
and the ledger series is book value, so market gains are never presented as
something the ledger recorded.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.core.query_helpers import fmt_year_month
from ledger_sync.db.models import (
    InvestmentHolding,
    MfHolding,
    NetWorthSnapshot,
    Transaction,
    TransactionType,
    User,
)

from .aggregate import _months
from .registry import (
    LIST_ENTITIES_MAX_LIMIT,
    ToolSpec,
    ledger_scope,
    register,
    to_decimal,
    to_optional_float,
)
from .schemas import NetWorthHistoryArguments, ToolArguments
from .transactions import _exec_list_accounts

MAX_SNAPSHOTS = 60


def _window_start(months: int) -> str:
    """First month (``YYYY-MM``) of a window of *months* ending this month."""
    today = ledger_today()
    index = today.year * 12 + (today.month - 1) - (months - 1)
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def _ledger_monthly(user: User, db: Session, first: str) -> list[dict[str, Any]]:
    """Each month's income minus expenses and their running total since the first row."""
    month = fmt_year_month(Transaction.date)
    signed = case(
        (Transaction.type == TransactionType.INCOME, Transaction.amount),
        (Transaction.type == TransactionType.EXPENSE, -Transaction.amount),
        else_=0,
    )
    flows: dict[str, Decimal] = {
        str(key): total
        for key, total in db.execute(
            ledger_scope(user, select(month, func.coalesce(func.sum(signed), 0))).group_by(month)
        ).all()
    }
    if not flows:
        return []
    running = 0.0
    series = []
    for key in _months(min(flows), ledger_today().strftime("%Y-%m")):
        net = to_decimal(flows.get(key))
        running += net
        if key >= first:
            series.append(
                {"month": key, "net_flow": round(net, 2), "book_balance": round(running, 2)}
            )
    return series


def _exec_get_net_worth_history(user: User, db: Session, args: dict[str, Any]) -> Any:
    first = _window_start(args["months"])
    since = datetime.fromisoformat(f"{first}-01")
    snapshots = list(
        db.scalars(
            select(NetWorthSnapshot)
            .where(NetWorthSnapshot.user_id == user.id, NetWorthSnapshot.snapshot_date >= since)
            .order_by(NetWorthSnapshot.snapshot_date.desc())
            .limit(MAX_SNAPSHOTS)
        )
    )
    snapshots.reverse()
    return {
        "from_month": first,
        "snapshots": [
            {
                "date": snap.snapshot_date.date().isoformat(),
                "net_worth": to_decimal(snap.net_worth),
                "assets": to_decimal(snap.total_assets),
                "liabilities": to_decimal(snap.total_liabilities),
            }
            for snap in snapshots
        ],
        "ledger_monthly": _ledger_monthly(user, db, first),
        "note": (
            "snapshots are stored when the ledger is imported, so they can be sparse. "
            "ledger_monthly has every month: net_flow is income minus expenses that month and "
            "book_balance their running total since the first transaction (book value: market "
            "gains are not included)."
        ),
    }


def _fund(holding: MfHolding) -> tuple[float, float, dict[str, Any]]:
    """(value, cost, row) for one scheme; value and cost count as 0 when unknown."""
    nav = holding.statement_nav
    value = None if nav is None else round(float(holding.units * nav), 2)
    cost = to_optional_float(holding.cost)
    nav_date = holding.statement_nav_date
    row = {
        "scheme": holding.scheme_name,
        "amc": holding.amc,
        "type": holding.scheme_type,
        "units": float(holding.units),
        "cost": cost,
        "nav": to_optional_float(nav),
        "nav_date": nav_date.isoformat() if nav_date else None,
        "value": value,
    }
    return value or 0.0, cost or 0.0, row


def _exec_list_investment_holdings(user: User, db: Session, _args: dict[str, Any]) -> Any:
    held = sorted(
        (
            _fund(holding)
            for holding in db.scalars(
                select(MfHolding).where(MfHolding.user_id == user.id, MfHolding.units > 0)
            )
        ),
        key=lambda fund: -fund[0],
    )[:LIST_ENTITIES_MAX_LIMIT]
    accounts = [
        {"account": account["name"], "book_balance": round(account["balance"], 2)}
        for account in _exec_list_accounts(user, db, {})["accounts"]
        if account["type"] == "Investments"
    ]
    other = [
        {
            "account": row.account,
            "type": row.investment_type,
            "instrument": row.instrument_name,
            "invested": to_decimal(row.invested_amount),
            "value": to_decimal(row.current_value),
        }
        for row in db.scalars(
            select(InvestmentHolding).where(
                InvestmentHolding.user_id == user.id, InvestmentHolding.is_active.is_(True)
            )
        )
    ]
    return {
        "mutual_funds": [row for _value, _cost, row in held],
        "mutual_fund_totals": {
            "schemes": len(held),
            "cost": round(sum(cost for _value, cost, _row in held), 2),
            "value": round(sum(value for value, _cost, _row in held), 2),
        },
        "investment_accounts": accounts[:LIST_ENTITIES_MAX_LIMIT],
        "other_holdings": other[:LIST_ENTITIES_MAX_LIMIT],
        "note": (
            "Mutual funds come from the last CAS import, valued at the statement NAV. "
            "investment_accounts are accounts classified as Investments with their book balance "
            "(contributions minus withdrawals, not market value). Empty lists mean nothing is "
            "imported or classified yet."
        ),
    }


register(
    ToolSpec(
        name="get_net_worth_history",
        description=(
            "Net worth over time: stored snapshots plus a month-by-month book balance from the "
            "ledger. Use for net worth trend or savings growth charts."
        ),
        arguments_model=NetWorthHistoryArguments,
        execute=_exec_get_net_worth_history,
    )
)

register(
    ToolSpec(
        name="list_investment_holdings",
        description=(
            "Mutual fund holdings from the CAS import (units, cost, statement NAV, value) and "
            "investment accounts with their book balances. Use for portfolio mix or holdings "
            "charts."
        ),
        arguments_model=ToolArguments,
        execute=_exec_list_investment_holdings,
    )
)

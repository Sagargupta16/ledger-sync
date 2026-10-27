"""Balance checks against the ledger: running balances, freshness and month coverage.

A check says "the bank showed X for account A at the end of day D". The ledger
side is every live row touching A up to and including D: income credits and
expenses debit ``account``, a transfer debits ``from_account`` and credits
``to_account`` (the rule ``services.calculation_service.account_balances``
applies). Excluded accounts stay out of the list but never out of the
arithmetic: a transfer into an excluded account still left the checked one,
and the bank saw it leave.

An account's balance, freshness dot and rows-since-check count are read as of
today (IST): a row dated later still counts toward its rows and months, but
never moves those figures. Data Health already reports such rows as a defect.

Three grouped reads give each account's net change and row count per day, so
the cost does not grow with the number of accounts or checks. Writes live in
``core.balance_check_writes``.
"""

from __future__ import annotations

from bisect import bisect_right
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.core.query_helpers import (
    closed_accounts_for,
    excluded_accounts_for,
    fmt_date,
    ledger_criteria,
)
from ledger_sync.db.models import BalanceCheck, Transaction, TransactionType, User

#: A check within one rupee of the ledger matches: bank apps round paise.
TOLERANCE = Decimal("1.00")
#: Days without a row or a check before an account reads as idle.
IDLE_DAYS = 30

#: ``SUM(ABS(amount))`` typed as the amount column, so both dialects return Decimal.
_SUM = func.sum(
    func.abs(Transaction.amount, type_=Transaction.amount.type), type_=Transaction.amount.type
)


@dataclass(frozen=True, slots=True)
class _Series:
    """One account's end-of-day running balance and cumulative row count."""

    days: list[str]
    balances: list[Decimal]
    rows: list[int]

    def at(self, day: str) -> tuple[Decimal, int]:
        """Balance and rows counted through the end of *day* (``YYYY-MM-DD``)."""
        index = bisect_right(self.days, day)
        if index == 0:
            return Decimal(0), 0
        return self.balances[index - 1], self.rows[index - 1]

    def last_day_through(self, day: str) -> str | None:
        """The newest day with rows on or before *day*."""
        index = bisect_right(self.days, day)
        return self.days[index - 1] if index else None


def _daily_flows(db: Session, user_id: int) -> dict[str, dict[str, list[Any]]]:
    """Per account, ``{day: [net change, rows]}`` over every live row."""
    flows: dict[str, dict[str, list[Any]]] = defaultdict(dict)

    def add(account: str | None, day: str, amount: Decimal, count: int) -> None:
        if not account:
            return
        entry = flows[account].setdefault(day, [Decimal(0), 0])
        entry[0] += amount
        entry[1] += count

    day = fmt_date(Transaction.date)
    live = ledger_criteria(user_id, set())
    regular = db.execute(
        select(Transaction.account, day, Transaction.type, _SUM, func.count())
        .where(*live, Transaction.type != TransactionType.TRANSFER)
        .group_by(Transaction.account, day, Transaction.type)
    )
    for account, day_key, tx_type, total, count in regular:
        add(account, day_key, total if tx_type == TransactionType.INCOME else -total, count)
    for column, sign in ((Transaction.from_account, -1), (Transaction.to_account, 1)):
        transfers = db.execute(
            select(column, day, _SUM, func.count())
            .where(*live, Transaction.type == TransactionType.TRANSFER, column.is_not(None))
            .group_by(column, day)
        )
        for account, day_key, total, count in transfers:
            add(account, day_key, total * sign, count)
    return flows


def _series(per_day: dict[str, list[Any]]) -> _Series:
    days = sorted(per_day)
    balances: list[Decimal] = []
    rows: list[int] = []
    balance, count = Decimal(0), 0
    for day in days:
        balance += per_day[day][0]
        count += per_day[day][1]
        balances.append(balance)
        rows.append(count)
    return _Series(days, balances, rows)


def account_status(
    *, latest_matches: bool | None, rows_after: int, last_activity: date | None, today: date
) -> str:
    """The freshness dot: a mismatch outranks idleness, idleness outranks the rest."""
    if latest_matches is False:
        return "mismatch"
    if last_activity is not None and (today - last_activity).days > IDLE_DAYS:
        return "idle"
    if latest_matches is None:
        return "unchecked"
    return "changed" if rows_after > 0 else "matched"


def _check_results(series: _Series, checks: list[BalanceCheck]) -> list[dict[str, Any]]:
    """Each check against the ledger at the end of its own day, in the given order."""
    results: list[dict[str, Any]] = []
    for check in checks:
        ledger, _ = series.at(check.check_date.isoformat())
        difference = check.balance - ledger
        results.append(
            {
                "id": check.id,
                "check_date": check.check_date.isoformat(),
                "balance": float(check.balance),
                "ledger_balance": float(ledger),
                "difference": float(difference),
                "matches": abs(difference) <= TOLERANCE,
            }
        )
    return results


def _month_counts(per_day: dict[str, list[Any]]) -> list[dict[str, Any]]:
    """Rows per calendar month, oldest first; a month without rows is left out."""
    months: dict[str, int] = defaultdict(int)
    for day, (_, count) in per_day.items():
        months[day[:7]] += count
    return [{"month": month, "rows": months[month]} for month in sorted(months)]


def _account_entry(
    name: str,
    per_day: dict[str, list[Any]],
    checks: list[BalanceCheck],
    *,
    closed: bool,
    today: date,
) -> dict[str, Any]:
    """One account; *checks* newest first. Balance, dot and rows after are as of *today*."""
    series = _series(per_day)
    results = _check_results(series, checks)
    today_key = today.isoformat()
    ledger, rows_through_today = series.at(today_key)
    latest_day = checks[0].check_date.isoformat() if checks else None
    rows_after = rows_through_today - series.at(latest_day)[1] if latest_day else 0
    activity = [day for day in (series.last_day_through(today_key), latest_day) if day]
    last_activity = max(activity, default=None)
    return {
        "account": name,
        "is_closed": closed,
        "status": account_status(
            latest_matches=results[0]["matches"] if results else None,
            rows_after=rows_after,
            last_activity=date.fromisoformat(last_activity) if last_activity else None,
            today=today,
        ),
        "ledger_balance": float(ledger),
        "transaction_count": series.rows[-1] if series.rows else 0,
        "first_date": series.days[0] if series.days else None,
        "last_date": series.days[-1] if series.days else None,
        "last_activity": last_activity,
        "rows_after_check": rows_after,
        "checks": results,
        "months": _month_counts(per_day),
    }


def balance_check_summary(db: Session, user: User) -> dict[str, Any]:
    """Every listed account with its checks, status and month coverage, by name."""
    today = ledger_today()
    flows = _daily_flows(db, user.id)
    by_account: dict[str, list[BalanceCheck]] = defaultdict(list)
    for check in db.scalars(
        select(BalanceCheck)
        .where(BalanceCheck.user_id == user.id)
        .order_by(BalanceCheck.check_date.desc(), BalanceCheck.id.desc())
    ):
        by_account[check.account].append(check)
    excluded = excluded_accounts_for(user)
    closed = closed_accounts_for(db, user.id)
    names = {name for name in flows if name not in excluded} | set(by_account)
    return {
        "as_of": today.isoformat(),
        "idle_days": IDLE_DAYS,
        "tolerance": float(TOLERANCE),
        "accounts": [
            _account_entry(
                name,
                flows.get(name, {}),
                by_account.get(name, []),
                closed=name.lower() in closed,
                today=today,
            )
            for name in sorted(names, key=lambda label: (label.lower(), label))
        ],
    }

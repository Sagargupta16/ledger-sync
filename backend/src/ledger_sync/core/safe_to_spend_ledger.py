"""Ledger reads behind safe-to-spend: account roles, balances and spending history.

An account's role comes only from the user's own classification, never from
its name: Cash, Bank Accounts and Other Wallets hold spendable money, Credit
Cards hold debt, and everything else (investments, loans, unclassified) is left
out. One narrow lexical rule matches ``PARKED_DEPOSIT_PATTERNS`` in
``frontend/src/lib/ageOfMoneyCalculator.ts``: a security or rent deposit filed
under a spendable type is money a third party holds. Change both together, or
Days of Buffering and safe-to-spend disagree about the same pool.

A closed account has nothing left to spend and takes no new flows, but what it
still owes stays owed: a negative balance on a closed card or bank account is
a liability, its positive balance is not cash. Days of Buffering has no closed
filter, so it still counts that positive balance.
"""

from __future__ import annotations

import calendar
import re
from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from statistics import median
from typing import Literal

from sqlalchemy import func
from sqlalchemy.orm import Session

from ledger_sync.core.expense_class import without_capital_losses
from ledger_sync.core.query_helpers import (
    build_transaction_query,
    capital_loss_keys_for,
    fmt_year_month,
)
from ledger_sync.core.safe_to_spend_labels import row_pattern_key
from ledger_sync.db.models import AccountType, Transaction, TransactionType, User
from ledger_sync.services.account_settings import get_account_type_lookup, get_closed_account_keys
from ledger_sync.services.calculation_service import account_balances

Role = Literal["spendable", "card", "other", "unclassified", "closed"]

_SPENDABLE_TYPES = frozenset(
    {AccountType.CASH.value, AccountType.BANK_ACCOUNTS.value, AccountType.OTHER_WALLETS.value}
)
_PARKED_DEPOSIT = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bsecurity\s+deposits?\b",
        r"\brent(?:al)?\s+deposits?\b",
        r"\bcaution\s+(?:money|deposits?)\b",
        r"\bescrow\b",
        r"^\s*deposits?\s*$",
    )
)
_ZERO = Decimal(0)


@dataclass(frozen=True, slots=True)
class AccountPool:
    """Each account label's role, read through the user's canonical and alias keys."""

    types: dict[str, str]
    closed: frozenset[str]

    def role(self, account: str) -> Role:
        """The account's part in the pool today; a closed account has none."""
        if account.lower() in self.closed:
            return "closed"
        return self.classified_role(account)

    def classified_role(self, account: str) -> Role:
        """The role its classification gives, whether or not it is closed."""
        kind = self.types.get(account.lower())
        if kind is None:
            return "unclassified"
        if kind == AccountType.CREDIT_CARDS.value:
            return "card"
        if kind in _SPENDABLE_TYPES and not any(p.search(account) for p in _PARKED_DEPOSIT):
            return "spendable"
        return "other"

    def counts_for_cash(self, account: str) -> bool:
        """A commitment moves spendable money unless it sits on a non-cash account.

        Unclassified labels (including hand-added commitments, whose account is
        ``Manual``) count, so an obligation is never dropped for want of a label.
        """
        return self.role(account) in ("spendable", "card", "unclassified")


def load_pool(db: Session, user_id: int) -> AccountPool:
    return AccountPool(
        get_account_type_lookup(db, user_id), frozenset(get_closed_account_keys(db, user_id))
    )


def _day_start(day: date) -> datetime:
    """Naive midnight, the form of the stored ``Transaction.date`` column."""
    return datetime.combine(day, time())


def balances_through(db: Session, user: User, day: date) -> dict[str, Decimal]:
    """Each account's balance from every live row dated on or before ``day``."""
    rows = account_balances(db, user, None, _day_start(day))
    return {name: Decimal(str(entry["balance"])) for name, entry in rows.items()}


def latest_row_date(db: Session, user: User, day: date) -> date | None:
    """Date of the newest live row on or before ``day``: how fresh the balances are."""
    latest = (
        build_transaction_query(db, user, None, _day_start(day))
        .with_entities(func.max(Transaction.date))
        .scalar()
    )
    return latest.date() if latest else None


def discretionary_spend(
    db: Session,
    user: User,
    start: date,
    end: date,
    *,
    recurring_keys: frozenset[str],
    pool: AccountPool,
) -> dict[date, dict[str, Decimal]]:
    """Expense per day and account on spendable and card accounts, bills left out.

    A row is a bill when its detection label is an active expense commitment's
    or schedule's; classified capital losses are not spending at all.
    """
    query = without_capital_losses(
        build_transaction_query(db, user, _day_start(start), _day_start(end)).filter(
            Transaction.type == TransactionType.EXPENSE
        ),
        capital_loss_keys_for(user),
    )
    rows = query.with_entities(
        Transaction.date,
        Transaction.account,
        Transaction.amount,
        Transaction.note,
        Transaction.category,
        Transaction.subcategory,
    ).all()
    roles: dict[str, Role] = {}
    by_day: dict[date, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    for on, account, amount, note, category, subcategory in rows:
        role = roles.setdefault(account, pool.role(account))
        if role not in ("spendable", "card"):
            continue
        if row_pattern_key(note, category, subcategory) in recurring_keys:
            continue
        by_day[on.date()][account] += abs(amount)
    return by_day


def _daily_totals(
    by_day: dict[date, dict[str, Decimal]], first: date, last: date, include: Callable[[str], bool]
) -> list[Decimal]:
    """Spend on each calendar day of ``[first, last]``, no-spend days as zero."""
    return [
        sum(
            (
                amount
                for account, amount in by_day.get(first + timedelta(days=i), {}).items()
                if include(account)
            ),
            _ZERO,
        )
        for i in range((last - first).days + 1)
    ]


def median_daily(
    by_day: dict[date, dict[str, Decimal]], first: date, last: date, include: Callable[[str], bool]
) -> Decimal:
    """The typical day: median spend over every calendar day of ``[first, last]``.

    Medianing only the days that had spending would make it a typical spending
    day; ``computeDailyBurn`` in the frontend counts the zero days for that reason.
    """
    totals = _daily_totals(by_day, first, last, include)
    return Decimal(median(totals)) if totals else _ZERO


def mean_daily(
    by_day: dict[date, dict[str, Decimal]], first: date, last: date, include: Callable[[str], bool]
) -> Decimal:
    """The burn rate: total spend over ``[first, last]`` divided by its days.

    A balance falls by everything spent, and on a skewed ledger the median day
    leaves most of it out (``computeBufferBreakdown`` divides by the mean too).
    """
    totals = _daily_totals(by_day, first, last, include)
    return sum(totals, _ZERO) / len(totals) if totals else _ZERO


def _month_bounds(key: str) -> tuple[date, date]:
    year, month = map(int, key.split("-"))
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def transfer_rates(
    db: Session, user: User, month_keys: Iterable[str], pool: AccountPool
) -> dict[str, Decimal]:
    """Median net transfers per day for each spendable account over whole months.

    Top-ups into a wallet, card bills and SIPs out of a bank account are
    transfers, which commitments do not cover. Their usual monthly net, spread
    over the days, keeps a wallet that is refilled every month from reading as
    drained. A median over the months ignores one-off moves such as opening an FD.
    """
    keys = sorted(month_keys)
    if not keys:
        return {}
    start, end = _month_bounds(keys[0])[0], _month_bounds(keys[-1])[1]
    base = build_transaction_query(db, user, _day_start(start), _day_start(end)).filter(
        Transaction.type == TransactionType.TRANSFER
    )
    month = fmt_year_month(Transaction.date)
    total = func.sum(func.abs(Transaction.amount), type_=Transaction.amount.type)
    net: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    for column, sign in ((Transaction.to_account, 1), (Transaction.from_account, -1)):
        for account, key, amount in (
            base.with_entities(column, month, total).group_by(column, month).all()
        ):
            if account and pool.role(account) == "spendable":
                net[account][key] += amount if sign > 0 else -amount
    return {
        account: Decimal(
            median(by_month.get(key, _ZERO) / _month_bounds(key)[1].day for key in keys)
        )
        for account, by_month in net.items()
    }

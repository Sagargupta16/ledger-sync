"""Ledger reads behind credit-card statement cycles, scoped to one user.

The card days and the paying account are table-only columns of
``ledger_accounts`` that only a Money Manager backup import writes, so they are
read through the Core ``LEDGER_ACCOUNTS`` table. Ledger rows are matched on
account identity (``account_id``, ``from_account_id``, ``to_account_id``),
which a backup import writes onto every live row. Every read starts from
``ledger_criteria``: the user's live rows, less the accounts passed as excluded.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ledger_sync.core.card_cycles import Movement
from ledger_sync.core.query_helpers import ledger_criteria
from ledger_sync.db.models import LEDGER_ACCOUNTS, AccountType, Transaction, TransactionType
from ledger_sync.schemas.card_cycles import SkippedCard

_AMOUNT = func.abs(Transaction.amount, type_=Transaction.amount.type)
_TOTAL = func.sum(_AMOUNT, type_=Transaction.amount.type)


@dataclass(frozen=True, slots=True)
class CardAccount:
    """An open credit card with both card days; ``paying_id`` is another of the user's accounts."""

    id: int
    name: str
    statement_day: int
    payment_day: int
    paying_id: int | None


def load_cards(
    db: Session, user_id: int
) -> tuple[dict[int, str], list[CardAccount], list[SkippedCard]]:
    """Account names by ID, the cards that have cycles, and the cards that do not."""
    c = LEDGER_ACCOUNTS.c
    columns = (c.id, c.name, c.account_type, c.is_closed, c.statement_day, c.payment_day)
    rows = sorted(
        db.execute(select(*columns, c.paid_from_account_id).where(c.user_id == user_id)),
        key=lambda row: (row.name.lower(), row.id),
    )
    names: dict[int, str] = {row.id: row.name for row in rows}
    cards: list[CardAccount] = []
    skipped: list[SkippedCard] = []
    for row in rows:
        if row.account_type != AccountType.CREDIT_CARDS:
            continue
        if row.is_closed:
            skipped.append(SkippedCard(account_id=row.id, name=row.name, reason="closed"))
        elif not (_is_day(row.statement_day) and _is_day(row.payment_day)):
            skipped.append(SkippedCard(account_id=row.id, name=row.name, reason="no_settings"))
        else:
            cards.append(_card(row, names))
    return names, cards, skipped


def _is_day(value: Any) -> bool:
    return isinstance(value, int) and 1 <= value <= 31


def _card(row: Any, names: dict[int, str]) -> CardAccount:
    """The card a ``ledger_accounts`` row describes; a paying account must be another one."""
    paying = row.paid_from_account_id
    valid = paying in names and paying != row.id
    return CardAccount(
        row.id, row.name, row.statement_day, row.payment_day, paying if valid else None
    )


def balances_before(
    db: Session, user_id: int, ids: set[int], before: datetime, excluded: set[str]
) -> defaultdict[int, Decimal]:
    """Signed balance of each account from its rows dated before *before*; owed is negative.

    Income credits and expenses debit ``account_id``; a transfer debits
    ``from_account_id`` and credits ``to_account_id``, as the account balances
    do. Rows that touch an *excluded* account are left out, as they are there.
    """
    totals: defaultdict[int, Decimal] = defaultdict(Decimal)
    if not ids:
        return totals
    dated = (*ledger_criteria(user_id, excluded), Transaction.date < before)
    flows = db.execute(
        select(Transaction.account_id, Transaction.type, _TOTAL)
        .where(
            *dated, Transaction.type != TransactionType.TRANSFER, Transaction.account_id.in_(ids)
        )
        .group_by(Transaction.account_id, Transaction.type)
    )
    for account_id, kind, total in flows:
        totals[account_id] += total if kind == TransactionType.INCOME else -total
    for column, sign in ((Transaction.from_account_id, -1), (Transaction.to_account_id, 1)):
        moved = db.execute(
            select(column, _TOTAL)
            .where(*dated, Transaction.type == TransactionType.TRANSFER, column.in_(ids))
            .group_by(column)
        )
        for account_id, total in moved:
            totals[account_id] += sign * total
    return totals


def card_movements(
    db: Session, user_id: int, cards: list[CardAccount], start: datetime, until: datetime
) -> defaultdict[int, list[Movement]]:
    """Each card's rows from *start* to before *until*, as charges, credits and payments.

    Nothing is excluded here: a payment from an account the user keeps out of
    analytics still pays the card.
    """
    paying = {card.id: card.paying_id for card in cards}
    ids = set(paying)
    rows = db.execute(
        select(
            Transaction.date,
            Transaction.type,
            _AMOUNT,
            Transaction.account_id,
            Transaction.from_account_id,
            Transaction.to_account_id,
        ).where(
            *ledger_criteria(user_id, set()),
            Transaction.date >= start,
            Transaction.date < until,
            or_(
                Transaction.account_id.in_(ids),
                Transaction.from_account_id.in_(ids),
                Transaction.to_account_id.in_(ids),
            ),
        )
    )
    found: defaultdict[int, list[Movement]] = defaultdict(list)
    for moment, kind, amount, account_id, from_id, to_id in rows:
        day = moment.date()
        if kind == TransactionType.TRANSFER:
            _add_transfer(found, paying, day, amount, (from_id, to_id))
        elif account_id in paying:
            found[account_id].append(_flow_movement(kind, day, amount))
    return found


def _add_transfer(
    found: defaultdict[int, list[Movement]],
    paying: dict[int, int | None],
    day: date,
    amount: Decimal,
    ends: tuple[int | None, int | None],
) -> None:
    """A transfer charges the card it leaves and pays the card it reaches."""
    from_id, to_id = ends
    if from_id == to_id:
        return
    if from_id is not None and from_id in paying:
        found[from_id].append(Movement(day, charge=amount))
    if to_id is not None and to_id in paying:
        from_payer = from_id is not None and from_id == paying[to_id]
        found[to_id].append(Movement(day, payment=amount, from_paying_account=from_payer))


def _flow_movement(kind: TransactionType, day: date, amount: Decimal) -> Movement:
    """An expense on the card is a charge; income on it is a refund or other credit."""
    if kind == TransactionType.EXPENSE:
        return Movement(day, charge=amount)
    return Movement(day, credit=amount)

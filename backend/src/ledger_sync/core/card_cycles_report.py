"""The ``GET /api/card-cycles`` report: every card's statements and the cash that pays them.

Cash left after dues is the paying account's balance today less the unpaid part
of the latest statement of each card it pays. Because a statement bills what
the card owed, an older unpaid statement is already inside the latest one, so
nothing is counted twice. Open-cycle spend is reported beside it, not deducted.
The paying account's balance leaves out the user's excluded accounts, as the
account balances do; a card's own rows are all counted.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from ledger_sync.core.card_cycles import ZERO, Cycle, build_cycles, period_starts
from ledger_sync.core.card_cycles_ledger import (
    CardAccount,
    balances_before,
    card_movements,
    load_cards,
)
from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.core.query_helpers import excluded_accounts_for
from ledger_sync.db.models import User
from ledger_sync.schemas.card_cycles import (
    CardCycle,
    CardCycleCard,
    CardCyclesResponse,
    PayingAccountCash,
)

DEFAULT_HISTORY = 6


def card_cycles_report(
    db: Session, user: User, history: int = DEFAULT_HISTORY, today: date | None = None
) -> CardCyclesResponse:
    """Each open credit card's statements, newest first, as of *today* (IST by default)."""
    today = today or ledger_today()
    history = max(1, history)
    names, cards, skipped = load_cards(db, user.id)
    if not cards:
        return CardCyclesResponse(as_of=today, cards=[], paying_accounts=[], skipped=skipped)
    since = min(period_starts(today, card.statement_day, history)[0] for card in cards)
    start = datetime.combine(since, time.min)
    until = datetime.combine(today + timedelta(days=1), time.min)
    opening = balances_before(db, user.id, {card.id for card in cards}, start, set())
    movements = card_movements(db, user.id, cards, start, until)
    built = [
        (
            card,
            build_cycles(
                today,
                (card.statement_day, card.payment_day),
                -opening[card.id],
                movements[card.id],
                history,
            ),
        )
        for card in cards
    ]
    paying_ids = {card.paying_id for card in cards if card.paying_id is not None}
    cash = balances_before(db, user.id, paying_ids, until, excluded_accounts_for(user))
    return CardCyclesResponse(
        as_of=today,
        cards=[_card_out(card, cycles, names, today) for card, cycles in built],
        paying_accounts=_paying_accounts(built, names, cash),
        skipped=skipped,
    )


def _cycle_out(cycle: Cycle) -> CardCycle:
    return CardCycle(
        period_start=cycle.period_start,
        statement_date=cycle.statement_date,
        due_date=cycle.due_date,
        status=cycle.status,
        spend=float(cycle.spend),
        billed=float(cycle.billed),
        paid=float(cycle.paid),
        remaining=float(cycle.remaining),
        paid_on=cycle.paid_on,
        paid_from_paying_account=cycle.paid_from_paying_account,
    )


def _card_out(
    card: CardAccount, cycles: list[Cycle], names: dict[int, str], today: date
) -> CardCycleCard:
    current, latest = cycles[0], cycles[1]
    return CardCycleCard(
        account_id=card.id,
        name=card.name,
        statement_day=card.statement_day,
        payment_day=card.payment_day,
        paying_account_id=card.paying_id,
        paying_account=names[card.paying_id] if card.paying_id is not None else None,
        last_statement_date=latest.statement_date,
        next_statement_date=current.statement_date,
        due_date=latest.due_date,
        days_to_due=(latest.due_date - today).days,
        billed_amount=float(latest.billed),
        paid_amount=float(latest.paid),
        due_amount=float(latest.remaining),
        carried_in=float(latest.carried),
        status=latest.status,
        paid_on=latest.paid_on,
        paid_from_paying_account=latest.paid_from_paying_account,
        unbilled_amount=float(max(ZERO, current.spend)),
        next_due_date=current.due_date,
        days_to_next_due=(current.due_date - today).days,
        cycles=[_cycle_out(cycle) for cycle in cycles],
    )


def _paying_accounts(
    built: list[tuple[CardAccount, list[Cycle]]],
    names: dict[int, str],
    balances: defaultdict[int, Decimal],
) -> list[PayingAccountCash]:
    """One entry per paying account: its balance less the unpaid latest statements."""
    groups: defaultdict[int, list[tuple[CardAccount, list[Cycle]]]] = defaultdict(list)
    for card, cycles in built:
        if card.paying_id is not None:
            groups[card.paying_id].append((card, cycles))
    accounts: list[PayingAccountCash] = []
    for paying_id, members in groups.items():
        dues = sum((cycles[1].remaining for _, cycles in members), ZERO)
        unbilled = sum((max(ZERO, cycles[0].spend) for _, cycles in members), ZERO)
        balance = balances[paying_id]
        accounts.append(
            PayingAccountCash(
                account_id=paying_id,
                name=names[paying_id],
                balance=float(balance),
                upcoming_dues=float(dues),
                unbilled=float(unbilled),
                cash_after_dues=float(balance - dues),
                cards=[card.name for card, _ in members],
            )
        )
    return sorted(accounts, key=lambda account: (account.name.lower(), account.account_id))

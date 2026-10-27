"""Match bank alerts against ledger rows. ``bank_alert_inbox`` runs it on every read.

Nothing about a match is stored, so a later Money Manager import, a row edited
by hand or an alert the user ignores changes the answer the next time the list
is read.

A ledger row answers an alert when the amount agrees to the paisa, the dates
are at most ``WINDOW_DAYS`` apart and the side fits the direction: an Expense
or a Transfer's source answers a debit, an Income or a Transfer's destination
a credit, so one transfer between two of the user's accounts answers both its
debit and its credit alert. Each row side answers at most one alert, and
same-amount spends within two days are common (39% of one real ledger's debit
rows have such a twin). Alerts are taken in date order and each gets the
earliest free row in its window; a last pass then moves an already paired alert
to another free row in its window whenever that lets a still unpaired alert
pair too (augmenting paths), so as many alerts are paired as the rows allow.

Account names rarely carry digits, so the account behind a card or account
tail is learned from the ledger itself: every alert spreads one vote across the
accounts of its candidate rows, skipping accounts named after another bank, and
a tail belongs to the account with the most votes. An alert tries rows in that
account first (for a tail not learned yet, accounts named after the alert's
bank) and only then any account. The account therefore decides which alert a
shared row answers, and the last pass keeps that order when it moves an alert,
so the preference never leaves an alert missing that another pairing would match.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from ledger_sync.core.bank_alert_profiles import ALIAS_PATTERNS
from ledger_sync.db.models import BankAlert, TransactionType

WINDOW_DAYS = 2

# transaction_id, date, amount, type, account, from_account, to_account
LedgerRow = tuple[str, datetime, Decimal, TransactionType, str, str | None, str | None]
# One side of one ledger row: (direction, transaction_id).
_Key = tuple[str, str]


@dataclass(frozen=True, slots=True)
class _Side:
    transaction_id: str
    day: date
    account: str


_Sides = dict[tuple[str, Decimal], list[_Side]]


def _sides(rows: Iterable[LedgerRow]) -> _Sides:
    sides: _Sides = defaultdict(list)
    for transaction_id, when, amount, kind, account, from_account, to_account in rows:
        day = when.date()
        if kind == TransactionType.EXPENSE:
            sides["debit", amount].append(_Side(transaction_id, day, account))
        elif kind == TransactionType.INCOME:
            sides["credit", amount].append(_Side(transaction_id, day, account))
        else:
            # Transfers store account = from_account.
            sides["debit", amount].append(_Side(transaction_id, day, from_account or account))
            if to_account:
                sides["credit", amount].append(_Side(transaction_id, day, to_account))
    for group in sides.values():
        group.sort(key=lambda side: (side.day, side.transaction_id))
    return sides


def _window(sides: _Sides, alert: BankAlert) -> list[_Side]:
    group = sides.get((alert.direction, alert.amount), [])
    reach = timedelta(days=WINDOW_DAYS)
    return [s for s in group if abs(s.day - alert.occurred_on) <= reach]


def _banks_named(sides: _Sides) -> dict[str, frozenset[str]]:
    """The banks each candidate account is named after ("Swiggy HDFC Card": hdfc)."""
    accounts = {side.account for group in sides.values() for side in group}
    return {
        account: frozenset(key for key, alias in ALIAS_PATTERNS.items() if alias.search(account))
        for account in accounts
    }


def _plausible(alert: BankAlert, banks: frozenset[str]) -> bool:
    """False for an account named after a bank other than the alert's own."""
    return alert.bank is None or not banks or alert.bank in banks


def _learn_tails(
    alerts: Sequence[BankAlert], sides: _Sides, named: dict[str, frozenset[str]]
) -> dict[str, str]:
    votes: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for alert in alerts:
        window = _window(sides, alert)
        accounts = {side.account for side in window if _plausible(alert, named[side.account])}
        if alert.account_tail is None or not accounts:
            continue
        for account in accounts:
            votes[alert.account_tail][account] += 1 / len(accounts)
    learned: dict[str, str] = {}
    for tail, weights in votes.items():
        ranked = sorted(weights.items(), key=lambda item: item[1], reverse=True)
        if len(ranked) == 1 or ranked[0][1] > ranked[1][1]:
            learned[tail] = ranked[0][0]
    return learned


def _preference(
    alert: BankAlert, learned: dict[str, str], named: dict[str, frozenset[str]]
) -> Callable[[str], bool] | None:
    """Which accounts an alert tries first: its tail's learned owner, else its bank's."""
    owner = learned.get(alert.account_tail or "")
    if owner is not None:
        return lambda account: account == owner
    bank = alert.bank
    if bank is None:
        return None
    return lambda account: bank in named[account]


def _options(
    alert: BankAlert, sides: _Sides, accept: Callable[[str], bool] | None
) -> tuple[list[_Key], list[_Key]]:
    """The row sides in an alert's window, as (preferred, the rest), each by date."""
    window = _window(sides, alert)
    preferred = [s for s in window if accept is not None and accept(s.account)]
    rest = [s for s in window if s not in preferred]
    return (
        [(alert.direction, s.transaction_id) for s in preferred],
        [(alert.direction, s.transaction_id) for s in rest],
    )


def _augment(start: int, order: dict[int, list[_Key]], holder: dict[_Key, int]) -> bool:
    """Pair ``start`` by moving paired alerts to other free sides (Kuhn's algorithm).

    Depth-first and iterative: ``stack[i]`` is the alert that would take
    ``path[i]``, a side the next alert on the stack holds.
    """
    seen: set[_Key] = set()
    stack = [(start, iter(order[start]))]
    path: list[_Key] = []
    while stack:
        key = next((k for k in stack[-1][1] if k not in seen), None)
        if key is None:
            stack.pop()
            if path:
                path.pop()
            continue
        seen.add(key)
        path.append(key)
        owner = holder.get(key)
        if owner is None:
            for (taker, _), side in zip(stack, path, strict=True):
                holder[side] = taker
            return True
        stack.append((owner, iter(order[owner])))
    return False


def match_alerts(alerts: Sequence[BankAlert], rows: Iterable[LedgerRow]) -> dict[int, str]:
    """Alert id to the transaction id that answers it, for every alert a row answers."""
    sides = _sides(rows)
    named = _banks_named(sides)
    learned = _learn_tails(alerts, sides, named)
    ordered = sorted(alerts, key=lambda alert: (alert.occurred_on, alert.id))
    options = {a.id: _options(a, sides, _preference(a, learned, named)) for a in ordered}
    holder: dict[_Key, int] = {}
    paired: set[int] = set()
    # Preferred sides first, then any free side, then augmenting paths.
    for preferred_only in (True, False):
        for alert in ordered:
            if alert.id in paired:
                continue
            preferred, rest = options[alert.id]
            choices = preferred if preferred_only else preferred + rest
            key = next((k for k in choices if k not in holder), None)
            if key is not None:
                holder[key] = alert.id
                paired.add(alert.id)
    order = {alert_id: preferred + rest for alert_id, (preferred, rest) in options.items()}
    for alert in ordered:
        if alert.id not in paired and _augment(alert.id, order, holder):
            paired.add(alert.id)
    return {alert_id: transaction_id for (_, transaction_id), alert_id in holder.items()}

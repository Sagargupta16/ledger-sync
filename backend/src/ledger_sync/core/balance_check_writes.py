"""Record, correct and remove balance checks.

Each function stages its change on the caller's session; the router commits.
A check names an account the ledger uses and a day no later than today (IST):
nobody can read tomorrow's balance off a bank app.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.core.query_helpers import ledger_criteria
from ledger_sync.db.models import BalanceCheck, Transaction

SAME_DAY_MESSAGE = "This account already has a check on that day. Edit that one instead."


class BalanceCheckError(ValueError):
    """A check the ledger cannot accept; the message is written for the user."""


class DuplicateCheckError(BalanceCheckError):
    """The account already has a check on that day."""


def _validate_day(check_date: date) -> None:
    if check_date > ledger_today():
        raise BalanceCheckError("A balance check cannot be dated after today.")


def _account_in_ledger(db: Session, user_id: int, account: str) -> bool:
    uses_account = or_(
        Transaction.account == account,
        Transaction.from_account == account,
        Transaction.to_account == account,
    )
    statement = select(Transaction.transaction_id).where(
        *ledger_criteria(user_id, set()), uses_account
    )
    return db.execute(statement.limit(1)).first() is not None


def record_check(
    db: Session, user_id: int, account: str, check_date: date, balance: Decimal
) -> BalanceCheck:
    """Stage a new check, or replace the amount of the account's check for that day."""
    _validate_day(check_date)
    if not _account_in_ledger(db, user_id, account):
        raise BalanceCheckError(f"No transactions use the account {account!r}.")
    check = db.scalars(
        select(BalanceCheck).where(
            BalanceCheck.user_id == user_id,
            BalanceCheck.account == account,
            BalanceCheck.check_date == check_date,
        )
    ).one_or_none()
    if check is None:
        check = BalanceCheck(user_id=user_id, account=account, check_date=check_date)
        db.add(check)
    check.balance = balance
    return check


def update_check(
    db: Session, user_id: int, check_id: int, check_date: date, balance: Decimal
) -> BalanceCheck | None:
    """Stage a corrected day or amount; ``None`` when the check is not the user's."""
    check = db.scalars(
        select(BalanceCheck).where(BalanceCheck.id == check_id, BalanceCheck.user_id == user_id)
    ).one_or_none()
    if check is None:
        return None
    _validate_day(check_date)
    clash = select(BalanceCheck.id).where(
        BalanceCheck.user_id == user_id,
        BalanceCheck.account == check.account,
        BalanceCheck.check_date == check_date,
        BalanceCheck.id != check_id,
    )
    if db.execute(clash).first() is not None:
        raise DuplicateCheckError(SAME_DAY_MESSAGE)
    check.check_date = check_date
    check.balance = balance
    return check


def delete_check(db: Session, user_id: int, check_id: int) -> None:
    """Stage removal of the user's check; a missing id is already the wanted state."""
    db.execute(
        delete(BalanceCheck).where(BalanceCheck.id == check_id, BalanceCheck.user_id == user_id)
    )

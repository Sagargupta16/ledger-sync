"""The amount a recurring row expects: the user's own, kept beside the detected one.

Every analytics refresh re-derives ``expected_amount`` from history. An amount
the user typed lives in ``user_expected_amount``, which refresh never writes,
so it survives. Any reader that totals, sorts, prints or matches an amount uses
``effective_expected_amount``, not the stored detected value.

``user_expected_amount`` is mapped deferred: a read that uses the effective
amount adds ``load_user_amount()`` to its options; otherwise each row loads the
column with a SELECT of its own.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ColumnElement, func
from sqlalchemy.orm import undefer

from ledger_sync.db.models import RecurringTransaction

if TYPE_CHECKING:
    from sqlalchemy.sql.base import ExecutableOption

# Account of a row the user added by hand. Detection never derives its amount.
MANUAL_ACCOUNT = "Manual"


def load_user_amount() -> ExecutableOption:
    """Loader option for a read that uses the effective amount.

    A function rather than a module constant: building the option configures
    every mapper, which must not happen at import time.
    """
    return undefer(RecurringTransaction.user_expected_amount)


def effective_expected_amount(record: RecurringTransaction) -> Decimal:
    """The amount every reader uses: the user's amount when set, else the detected one."""
    user_amount = record.user_expected_amount
    return record.expected_amount if user_amount is None else user_amount


def detected_expected_amount(record: RecurringTransaction) -> Decimal | None:
    """The amount detection last derived from history; a row added by hand has none."""
    return None if record.account == MANUAL_ACCOUNT else record.expected_amount


def is_amount_edited(record: RecurringTransaction) -> bool:
    """The user's amount differs from the detected one, so a reset would change it.

    A stored amount that detection has since caught up with reads as unedited.
    It still holds, and reads as edited again, if detection moves away from it.
    """
    user_amount = record.user_expected_amount
    return user_amount is not None and user_amount != record.expected_amount


def effective_amount_sql() -> ColumnElement[Decimal]:
    """``effective_expected_amount`` as a SQL expression, for ORDER BY."""
    return func.coalesce(
        RecurringTransaction.user_expected_amount, RecurringTransaction.expected_amount
    )


def set_user_amount(record: RecurringTransaction, amount: Decimal | None) -> None:
    """Store the amount the user expects on a commitment; ``None`` clears it.

    On a detected row the amount goes in ``user_expected_amount``, beside the
    detected ``expected_amount`` that every refresh re-derives from history.
    Refresh never writes the user's column, so the amount survives it. An amount
    equal to the detected one clears the override instead of pinning a copy. A
    row added by hand has no detected amount and refresh never rewrites its
    amount, so the typed value stays in ``expected_amount``.
    """
    if record.account == MANUAL_ACCOUNT:
        if amount is not None:
            record.expected_amount = amount
        return
    record.user_expected_amount = (
        None if amount is None or amount == record.expected_amount else amount
    )

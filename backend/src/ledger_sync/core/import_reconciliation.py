"""Does the imported ledger agree with what the bank says? One derived verdict.

Two independent witnesses already exist: the user's balance checks (what a
statement showed against the running ledger balance, ``core.balance_checks``)
and the bank alert inbox (alerts with no ledger row, ``core.bank_alert_inbox``).
This module only reads their results, so nothing is stored and the verdict
moves the moment a re-import changes a row.

``ReconciliationState`` is derived by ``reconciliation_state`` and nothing else
(``docs/STATE_MACHINES.md``). Both source tables arrived with
``feature_domains_2026``; Vercel can serve this code before CI migrates, so a
missing table counts as zero rather than failing Data Health.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from ledger_sync.core.balance_checks import balance_check_summary
from ledger_sync.core.bank_alert_inbox import alert_inbox
from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.db.models import BalanceCheck, BankAlert, User

#: Same lookback the alert inbox endpoint defaults to.
ALERT_LOOKBACK_DAYS = 60


class ReconciliationState(StrEnum):
    """``attention`` outranks ``reconciled``; no checks and no alerts is ``unchecked``."""

    ATTENTION = "attention"
    RECONCILED = "reconciled"
    UNCHECKED = "unchecked"


def reconciliation_state(
    *, matched: int, mismatched: int, alerts_missing: int
) -> ReconciliationState:
    """The one place the verdict is derived."""
    if mismatched > 0 or alerts_missing > 0:
        return ReconciliationState.ATTENTION
    if matched > 0:
        return ReconciliationState.RECONCILED
    return ReconciliationState.UNCHECKED


def reconciliation_summary(db: Session, user_id: int) -> dict[str, Any]:
    """Account and alert agreement for *user_id*, from data the app already holds."""
    connection = inspect(db.connection())
    matched = mismatched = changed = missing = 0

    # The balance summary aggregates the whole ledger per account, so skip it for
    # a user who has never recorded a balance check (most reads of this endpoint).
    has_checks = connection.has_table(BalanceCheck.__tablename__) and (
        db.query(BalanceCheck.id).filter(BalanceCheck.user_id == user_id).first() is not None
    )
    user = db.get(User, user_id) if has_checks else None
    if user is not None:
        for account in balance_check_summary(db, user)["accounts"]:
            if account["status"] == "matched":
                matched += 1
            elif account["status"] == "mismatch":
                mismatched += 1
            elif account["status"] == "changed":
                changed += 1

    if connection.has_table(BankAlert.__tablename__):
        inbox = alert_inbox(db, user_id, ALERT_LOOKBACK_DAYS, today=ledger_today())
        missing = inbox.counts["missing"]

    checked = matched + mismatched
    return {
        "state": reconciliation_state(
            matched=matched, mismatched=mismatched, alerts_missing=missing
        ).value,
        "accounts_matched": matched,
        "accounts_mismatched": mismatched,
        "accounts_changed": changed,
        "alerts_missing": missing,
        "score_pct": round(matched / checked * 100) if checked else None,
    }

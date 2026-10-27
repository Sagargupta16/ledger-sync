"""The bank-alert inbox read: a user's recent alerts, each matched against the live ledger.

``alert_inbox`` loads the alerts that occurred in the lookback (at most
``MAX_ALERTS``), pairs the active ones with ledger rows (``bank_alert_matching``)
and tallies them. When more alerts than that occurred, it keeps whole days
only and moves ``since`` up to the oldest day it kept, marking the result
``truncated``, so the counts and ``since`` always describe the same alerts.

``after_last_import`` is true when the alert arrived after the newest import
finished, or before any import, so the next backup may still bring its row.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ledger_sync.core.bank_alert_matching import WINDOW_DAYS, LedgerRow, match_alerts
from ledger_sync.db.models import BankAlert, ImportLog, Transaction

MAX_ALERTS = 500

AlertStatusName = Literal["matched", "missing", "ignored"]


@dataclass(frozen=True, slots=True)
class InboxEntry:
    alert: BankAlert
    status: AlertStatusName
    transaction_id: str | None
    after_last_import: bool


@dataclass(frozen=True, slots=True)
class AlertInbox:
    """Alerts from ``since`` on, newest first."""

    entries: list[InboxEntry]
    counts: Counter[AlertStatusName]
    since: date
    truncated: bool
    last_import_at: datetime | None


def _ledger_rows(db: Session, user_id: int, alerts: Sequence[BankAlert]) -> list[LedgerRow]:
    reach = timedelta(days=WINDOW_DAYS)
    first = min(alert.occurred_on for alert in alerts) - reach
    last = max(alert.occurred_on for alert in alerts) + reach + timedelta(days=1)
    stmt = select(
        Transaction.transaction_id,
        Transaction.date,
        Transaction.amount,
        Transaction.type,
        Transaction.account,
        Transaction.from_account,
        Transaction.to_account,
    ).where(
        Transaction.user_id == user_id,
        Transaction.is_deleted.is_(False),
        Transaction.date >= datetime.combine(first, time.min),
        Transaction.date < datetime.combine(last, time.min),
        Transaction.amount.in_(sorted({alert.amount for alert in alerts})),
    )
    return list(db.execute(stmt).tuples())


def last_import_at(db: Session, user_id: int) -> datetime | None:
    """When the newest import finished (naive UTC), or None before the first one."""
    return db.scalar(select(func.max(ImportLog.imported_at)).where(ImportLog.user_id == user_id))


def _recent_alerts(db: Session, user_id: int, since: date) -> tuple[list[BankAlert], date, bool]:
    """Alerts from ``since`` on, newest first; whole days only when over ``MAX_ALERTS``."""
    alerts = list(
        db.scalars(
            select(BankAlert)
            .where(BankAlert.user_id == user_id, BankAlert.occurred_on >= since)
            .order_by(BankAlert.occurred_on.desc(), BankAlert.id.desc())
            .limit(MAX_ALERTS + 1)
        )
    )
    if len(alerts) <= MAX_ALERTS:
        return alerts, since, False
    cut = alerts[MAX_ALERTS].occurred_on
    whole_days = [alert for alert in alerts if alert.occurred_on > cut]
    if not whole_days:  # more than MAX_ALERTS on one day: keep the newest of them
        return alerts[:MAX_ALERTS], cut, True
    return whole_days, cut + timedelta(days=1), True


def _status(alert: BankAlert, matched: dict[int, str]) -> AlertStatusName:
    if alert.ignored_at is not None:
        return "ignored"
    return "matched" if alert.id in matched else "missing"


def alert_inbox(db: Session, user_id: int, days: int, *, today: date) -> AlertInbox:
    """The user's alerts from the last ``days`` days, each matched against the ledger."""
    alerts, since, truncated = _recent_alerts(db, user_id, today - timedelta(days=days))
    active = [alert for alert in alerts if alert.ignored_at is None]
    matched = match_alerts(active, _ledger_rows(db, user_id, active)) if active else {}
    imported_at = last_import_at(db, user_id)
    entries = [
        InboxEntry(
            alert=alert,
            status=_status(alert, matched),
            transaction_id=matched.get(alert.id),
            after_last_import=imported_at is None or alert.received_at > imported_at,
        )
        for alert in alerts
    ]
    return AlertInbox(
        entries=entries,
        counts=Counter(entry.status for entry in entries),
        since=since,
        truncated=truncated,
        last_import_at=imported_at,
    )

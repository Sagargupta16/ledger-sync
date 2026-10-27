"""Read one forwarded bank alert and store it at most once; ignore or restore one.

The raw text is never stored. ``text_hash`` is the SHA-256 of the normalised
text and the alert's day, so a retried Shortcut run is a no-op while the same
undated text on another day (a monthly "Rs 199 debited towards NETFLIX") is a
new alert. ``ref_hash`` is the SHA-256 of the bank's reference and the amount,
which the SMS and email copies of one payment share; a reference shorter than
nine characters, all zeros or masked ("XXXX1234") is not unique enough to fold
alerts and is left out. A refund quoting the original reference is a credit,
so it stays separate from the debit it reverses. The table's unique
constraints settle a race between two deliveries; the loser re-reads the winner.

At most ``DAILY_LIMIT`` new alerts are stored per user in any 24 hours, counted
in the database, so the cap holds across serverless instances and restarts
(the route's per-token rate limit is in-memory and only best effort).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ledger_sync.core.bank_alert_fields import DATE_PAST
from ledger_sync.core.bank_alert_parser import parse_bank_alert
from ledger_sync.db.models import BankAlert

DAILY_LIMIT = 500
_MIN_REFERENCE = 9
# An alert that arrived in the last 24 hours arrived today or yesterday (IST), and
# its stored day is at most DATE_PAST before that; this bound lets the count use
# the (user_id, occurred_on) index.
_OCCURRED_REACH = DATE_PAST + timedelta(days=1)

IngestStatus = Literal["created", "duplicate", "not_an_alert", "over_limit"]


@dataclass(frozen=True, slots=True)
class IngestResult:
    status: IngestStatus
    alert: BankAlert | None


def _now() -> datetime:
    """Naive UTC, like the other audit timestamps."""
    return datetime.now(UTC).replace(tzinfo=None)


def _text_hash(text: str, occurred_on: date) -> str:
    normalised = " ".join(text.split()).lower()
    return hashlib.sha256(f"{occurred_on.isoformat()}|{normalised}".encode()).hexdigest()


def _ref_hash(reference: str | None, amount: Decimal) -> str | None:
    if reference is None or len(reference) < _MIN_REFERENCE:
        return None
    if not reference.strip("0") or "XX" in reference.upper():
        return None
    return hashlib.sha256(f"{reference.upper()}|{amount}".encode()).hexdigest()


def _existing(
    db: Session, user_id: int, text_hash: str, direction: str, ref_hash: str | None
) -> BankAlert | None:
    same = [BankAlert.text_hash == text_hash]
    if ref_hash is not None:
        same.append(and_(BankAlert.direction == direction, BankAlert.ref_hash == ref_hash))
    return db.scalar(select(BankAlert).where(BankAlert.user_id == user_id, or_(*same)).limit(1))


def _stored_in_last_day(db: Session, user_id: int, received_on: date) -> int:
    count = db.scalar(
        select(func.count())
        .select_from(BankAlert)
        .where(
            BankAlert.user_id == user_id,
            BankAlert.occurred_on >= received_on - _OCCURRED_REACH,
            BankAlert.received_at >= _now() - timedelta(days=1),
        )
    )
    return count or 0


def ingest_alert_text(
    db: Session, user_id: int, text: str, sender: str | None, *, received_on: date
) -> IngestResult:
    """Parse one bank SMS or email and store the alert, never the text. Commits."""
    parsed = parse_bank_alert(text, sender, received_on=received_on)
    if parsed is None:
        return IngestResult("not_an_alert", None)
    text_hash = _text_hash(text, parsed.occurred_on)
    ref_hash = _ref_hash(parsed.reference, parsed.amount)
    existing = _existing(db, user_id, text_hash, parsed.direction, ref_hash)
    if existing is not None:
        return IngestResult("duplicate", existing)
    if _stored_in_last_day(db, user_id, received_on) >= DAILY_LIMIT:
        return IngestResult("over_limit", None)
    alert = BankAlert(
        user_id=user_id,
        text_hash=text_hash,
        ref_hash=ref_hash,
        direction=parsed.direction,
        amount=parsed.amount,
        account_tail=parsed.account_tail,
        merchant=parsed.merchant,
        bank=parsed.bank,
        occurred_on=parsed.occurred_on,
        received_at=_now(),
    )
    db.add(alert)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _existing(db, user_id, text_hash, parsed.direction, ref_hash)
        if existing is None:
            raise
        return IngestResult("duplicate", existing)
    return IngestResult("created", alert)


def set_ignored(db: Session, user_id: int, alert_id: int, *, ignored: bool) -> BankAlert | None:
    """Ignore or restore one of the user's alerts; None when there is no such alert."""
    alert = db.scalar(
        select(BankAlert).where(BankAlert.id == alert_id, BankAlert.user_id == user_id)
    )
    if alert is None:
        return None
    if not ignored:
        alert.ignored_at = None
    elif alert.ignored_at is None:
        alert.ignored_at = _now()
    return alert

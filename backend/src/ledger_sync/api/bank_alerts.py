"""Bank-alert inbox: an automation forwards bank SMS or email text, and the app
lists the alerts the ledger does not have yet.

``POST /api/ingest/text`` accepts only an upload token created for the alert
inbox (scope ``alerts:ingest``), so an iPhone Shortcut can call it without the
OAuth sign-in, and it can do nothing else. It stores the parsed alert, never
the text (core/bank_alert_store.py). The signed-in routes list alerts with
their match against the current ledger (core/bank_alert_inbox.py) and ignore
or restore one.

Alerts are never written to the ledger: the next full Money Manager snapshot
would delete a hand-added row, so the unused quick-add route
``POST /api/transactions`` is deliberately not reused.
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from ledger_sync.api.deps import CurrentUser, DatabaseSession, require_token_scope
from ledger_sync.api.rate_limit import _upload_key_func, limiter
from ledger_sync.core.bank_alert_inbox import InboxEntry, alert_inbox
from ledger_sync.core.bank_alert_matching import WINDOW_DAYS
from ledger_sync.core.bank_alert_profiles import display_name
from ledger_sync.core.bank_alert_store import DAILY_LIMIT, ingest_alert_text, set_ignored
from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.db.models import BankAlert, User
from ledger_sync.schemas.bank_alerts import (
    BankAlertCounts,
    BankAlertEntry,
    BankAlertIngestRequest,
    BankAlertIngestResponse,
    BankAlertList,
    BankAlertSummary,
    BankAlertUpdate,
    BankAlertUpdated,
)
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="/api/bank-alerts", tags=["bank-alerts"])
ingest_router = APIRouter(prefix="/api/ingest", tags=["bank-alerts"])

IngestUser = Annotated[User, Depends(require_token_scope("alerts:ingest"))]

_NOT_AN_ALERT = (
    "This text does not read as a completed debit or credit with an INR amount and an "
    "account, card or reference number, so nothing was stored."
)
_OVER_LIMIT = (
    f"This inbox already stored {DAILY_LIMIT} new alerts in the last 24 hours, so nothing "
    "was stored. Try again later."
)


def _utc(value: datetime | None) -> str | None:
    """Stored naive but holding UTC; attach the zone so browsers do not shift it."""
    return value.replace(tzinfo=UTC).isoformat() if value is not None else None


def _summary(alert: BankAlert) -> BankAlertSummary:
    return BankAlertSummary(
        id=alert.id,
        direction="credit" if alert.direction == "credit" else "debit",
        amount=float(alert.amount),
        account_tail=alert.account_tail,
        merchant=alert.merchant,
        bank=display_name(alert.bank),
        occurred_on=alert.occurred_on.isoformat(),
    )


def _entry(entry: InboxEntry) -> BankAlertEntry:
    return BankAlertEntry(
        **_summary(entry.alert).model_dump(),
        received_at=_utc(entry.alert.received_at) or "",
        status=entry.status,
        after_last_import=entry.after_last_import,
        matched_transaction_id=entry.transaction_id,
    )


@ingest_router.post(
    "/text",
    status_code=status.HTTP_201_CREATED,
    responses={
        200: {"description": "Already stored (same text that day, or same reference and amount)"},
        401: {"description": "Not an alert-inbox upload token"},
        422: {"description": "Not a completed debit or credit alert; nothing stored"},
        429: {"description": "Rate limit, or the daily cap on new alerts, exceeded"},
    },
)
@limiter.limit("30/minute;500/day", key_func=_upload_key_func)
@limiter.limit("60/minute")
def ingest_text(
    request: Request,  # required by slowapi
    response: Response,
    payload: BankAlertIngestRequest,
    user: IngestUser,
    db: DatabaseSession,
) -> BankAlertIngestResponse:
    """Parse one bank SMS or email and store the alert, never the text."""
    result = ingest_alert_text(
        db, user.id, payload.text, payload.sender, received_on=ledger_today()
    )
    if result.status == "not_an_alert":
        logger.info("Bank alert skipped: not a completed debit or credit")
        raise HTTPException(status_code=422, detail=_NOT_AN_ALERT)
    if result.status == "over_limit" or result.alert is None:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=_OVER_LIMIT)
    if result.status == "duplicate":
        response.status_code = status.HTTP_200_OK
    return BankAlertIngestResponse(
        status="created" if result.status == "created" else "duplicate",
        alert=_summary(result.alert),
    )


@router.get("")
def get_bank_alerts(
    current_user: CurrentUser,
    db: DatabaseSession,
    days: Annotated[int, Query(ge=1, le=366)] = 60,
) -> BankAlertList:
    """Alerts from the last ``days`` IST days, newest first, matched against the ledger."""
    inbox = alert_inbox(db, current_user.id, days, today=ledger_today())
    return BankAlertList(
        alerts=[_entry(entry) for entry in inbox.entries],
        counts=BankAlertCounts(
            matched=inbox.counts["matched"],
            missing=inbox.counts["missing"],
            ignored=inbox.counts["ignored"],
        ),
        window_days=WINDOW_DAYS,
        since=inbox.since.isoformat(),
        truncated=inbox.truncated,
        last_import_at=_utc(inbox.last_import_at),
    )


@router.patch("/{alert_id}", responses={404: {"description": "No such alert"}})
def patch_bank_alert(
    alert_id: int,
    payload: BankAlertUpdate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> BankAlertUpdated:
    """Ignore an alert (it stops counting as missing) or restore it."""
    alert = set_ignored(db, current_user.id, alert_id, ignored=payload.ignored)
    if alert is None:
        raise HTTPException(status_code=404, detail="Bank alert not found")
    updated = BankAlertUpdated(id=alert.id, ignored=alert.ignored_at is not None)
    db.commit()
    return updated

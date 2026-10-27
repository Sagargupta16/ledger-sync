"""Web Push alerts: server status, the user's devices, a test send and the daily run.

Alerts stay off until the VAPID variables are set (``config/push_settings.py``);
until then every route says which ones are missing instead of failing quietly.
``/run-due`` is the daily Vercel cron: Vercel calls it with GET and
``Authorization: Bearer <CRON_SECRET>``, and POST with the same header runs it
by hand. Nothing here returns an endpoint URL, a private key or a secret.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Request, Response, status
from sqlalchemy.exc import IntegrityError

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.rate_limit import _user_key_func, limiter
from ledger_sync.config.push_settings import CRON_ENV, push_settings
from ledger_sync.config.settings import settings
from ledger_sync.core.ledger_clock import ledger_now
from ledger_sync.core.push_delivery import run_due_alerts, send_test
from ledger_sync.core.push_devices import (
    MAX_DEVICES,
    TooManyDevicesError,
    UnsupportedPushServiceError,
    endpoint_hash,
    forget_endpoint,
    list_devices,
    remove_device,
    save_device,
)
from ledger_sync.core.push_vapid import PushNotConfiguredError, VapidKeys, load_vapid
from ledger_sync.db.models import PushSubscription
from ledger_sync.schemas.push import (
    DEVICE_ID_MAX,
    PushConfig,
    PushDeliveryReport,
    PushDevice,
    PushDeviceList,
    PushEndpoint,
    PushRunReport,
    PushSubscriptionCreate,
    PushTestRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/push", tags=["push"])

DeviceId = Annotated[int, Path(ge=1, le=DEVICE_ID_MAX)]
_NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"description": "No such device"}}
_OFF: dict[int | str, dict[str, Any]] = {503: {"description": "Push is not configured"}}
_DAILY_OFF = f"Daily alerts start once {CRON_ENV} is set on the server. Tests work now."


def _utc(value: datetime | None) -> str | None:
    """Stored naive but holding UTC; attach the zone so browsers do not shift it."""
    return value.replace(tzinfo=UTC).isoformat() if value is not None else None


def _device(row: PushSubscription) -> PushDevice:
    return PushDevice(
        id=row.id,
        label=row.label,
        endpoint_hash=endpoint_hash(row.endpoint),
        created_at=_utc(row.created_at) or "",
        last_success_at=_utc(row.last_success_at),
    )


def _vapid() -> VapidKeys:
    try:
        return load_vapid()
    except PushNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/config")
def get_push_config(_user: CurrentUser) -> PushConfig:
    """Whether this server can send alerts; the public key is the browser's to use."""
    try:
        vapid = load_vapid()
    except PushNotConfiguredError as exc:
        return PushConfig(
            enabled=False, daily_alerts=False, public_key=None, missing=exc.missing, reason=str(exc)
        )
    daily = push_settings.cron_ready()
    return PushConfig(
        enabled=True,
        daily_alerts=daily,
        public_key=vapid.public_key,
        missing=[] if daily else [CRON_ENV],
        reason=None if daily else _DAILY_OFF,
    )


@router.get("/subscriptions")
def get_push_devices(current_user: CurrentUser, db: DatabaseSession) -> PushDeviceList:
    """The user's devices with alerts on, oldest first."""
    rows = list_devices(db, current_user.id)
    return PushDeviceList(devices=[_device(row) for row in rows], limit=MAX_DEVICES)


@router.post(
    "/subscriptions",
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "Device limit"}, 422: {"description": "Unsupported"}, **_OFF},
)
@limiter.limit("30/hour", key_func=_user_key_func)
def post_push_device(
    request: Request,  # required by slowapi
    payload: PushSubscriptionCreate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PushDevice:
    """Store this browser's push subscription for the user."""
    _vapid()
    keys = payload.keys
    try:
        row = save_device(
            db, current_user.id, payload.endpoint, keys.p256dh, keys.auth, payload.label
        )
        db.commit()
    except UnsupportedPushServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except TooManyDevicesError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except IntegrityError as exc:  # the same device saved twice at once
        db.rollback()
        raise HTTPException(status_code=409, detail="Please try again.") from exc
    return _device(row)


@router.delete(
    "/subscriptions/{device_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_NOT_FOUND
)
def delete_push_device(
    device_id: DeviceId, current_user: CurrentUser, db: DatabaseSession
) -> Response:
    """Stop alerts to one of the user's devices."""
    if not remove_device(db, current_user.id, device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/subscriptions/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
def post_push_unsubscribe(
    payload: PushEndpoint, current_user: CurrentUser, db: DatabaseSession
) -> Response:
    """Forget this browser by its endpoint (sign-out); unknown endpoints are fine."""
    forget_endpoint(db, current_user.id, payload.endpoint)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/test", responses={**_NOT_FOUND, **_OFF})
@limiter.limit("6/minute", key_func=_user_key_func)
def post_push_test(
    request: Request,  # required by slowapi
    payload: PushTestRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> PushDeliveryReport:
    """Send a test alert to one device, or to every device of the user."""
    vapid = _vapid()
    try:
        report = send_test(db, current_user.id, vapid, settings.frontend_url, payload.device_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Device not found") from exc
    return PushDeliveryReport(sent=report.sent, failed=report.failed, removed=report.removed)


def _run_due(request: Request, db: DatabaseSession) -> PushRunReport:
    secret = push_settings.cron_secret.get_secret_value().strip()
    if not secret:
        raise HTTPException(
            status_code=503,
            detail=f"Daily alerts are off until {CRON_ENV} is set on the server.",
        )
    supplied = request.headers.get("authorization", "")
    if not secrets.compare_digest(supplied.encode(), f"Bearer {secret}".encode()):
        raise HTTPException(
            status_code=401, detail="Not authorised", headers={"WWW-Authenticate": "Bearer"}
        )
    report = run_due_alerts(db, _vapid(), settings.frontend_url, ledger_now())
    logger.info(
        "Push run: %s users, %s devices, %s sent, %s failed, %s removed, %s up to date, "
        "%s deferred",
        report.users,
        report.devices,
        report.sent,
        report.failed,
        report.removed,
        report.up_to_date,
        report.deferred,
    )
    return PushRunReport(**asdict(report))


_RUN_RESPONSES: dict[int | str, dict[str, Any]] = {401: {"description": "Bad secret"}, **_OFF}


@router.get("/run-due", responses=_RUN_RESPONSES)
def get_run_due(request: Request, db: DatabaseSession) -> PushRunReport:
    """The daily Vercel cron: alert every device about what is new for its user."""
    return _run_due(request, db)


@router.post("/run-due", responses=_RUN_RESPONSES)
def post_run_due(request: Request, db: DatabaseSession) -> PushRunReport:
    """The same run, started by hand with the cron secret."""
    return _run_due(request, db)

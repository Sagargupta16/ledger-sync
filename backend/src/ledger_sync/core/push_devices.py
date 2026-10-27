"""The devices that receive a user's alerts: add, list and remove push subscriptions.

An endpoint is unique, so a browser belongs to one user at a time. When someone
else signs in on it and turns alerts on, the row moves to them with a clean
alert history; the previous owner stops getting alerts on that device.
"""

from __future__ import annotations

import hashlib

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ledger_sync.core.push_sender import is_push_service_endpoint
from ledger_sync.db._models.push_subscriptions import utc_now
from ledger_sync.db.models import PushSubscription

MAX_DEVICES = 10


class TooManyDevicesError(ValueError):
    """The user already has alerts on for the most devices allowed."""


class UnsupportedPushServiceError(ValueError):
    """The endpoint is not at a browser push service this server sends to."""


def endpoint_hash(endpoint: str) -> str:
    """What a browser compares to find its own row; endpoints are never sent back."""
    return hashlib.sha256(endpoint.encode()).hexdigest()


def list_devices(db: Session, user_id: int) -> list[PushSubscription]:
    stmt = select(PushSubscription).where(PushSubscription.user_id == user_id)
    return list(db.scalars(stmt.order_by(PushSubscription.created_at, PushSubscription.id)))


def save_device(
    db: Session, user_id: int, endpoint: str, p256dh: str, auth: str, label: str
) -> PushSubscription:
    """Add or refresh the user's device for *endpoint*."""
    if not is_push_service_endpoint(endpoint):
        raise UnsupportedPushServiceError("This browser's push service is not supported.")
    row = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    if row is None or row.user_id != user_id:
        held = db.scalar(
            select(func.count())
            .select_from(PushSubscription)
            .where(PushSubscription.user_id == user_id)
        )
        if (held or 0) >= MAX_DEVICES:
            raise TooManyDevicesError(
                f"Alerts are already on for {MAX_DEVICES} devices. Remove one first."
            )
    if row is None:
        row = PushSubscription(user_id=user_id, endpoint=endpoint, created_at=utc_now())
        db.add(row)
    elif row.user_id != user_id:
        row.user_id = user_id
        row.created_at = utc_now()
        row.last_success_at = None
        row.alert_keys = "[]"
    row.p256dh_key = p256dh
    row.auth_key = auth
    row.label = label
    db.flush()
    return row


def remove_device(db: Session, user_id: int, device_id: int) -> bool:
    """Delete one of the user's devices; False when it is not theirs or not there."""
    row = db.scalar(
        select(PushSubscription).where(
            PushSubscription.id == device_id, PushSubscription.user_id == user_id
        )
    )
    if row is None:
        return False
    db.delete(row)
    return True


def forget_endpoint(db: Session, user_id: int, endpoint: str) -> None:
    """Drop the user's row for *endpoint* if there is one; sign-out calls this."""
    db.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == user_id, PushSubscription.endpoint == endpoint
        )
    )

"""Send to a user's devices: the test from Settings and the daily alert run.

Sends follow the backend execution boundary: every read finishes and its
transaction ends before the first network call. Each device's result goes back
in its own short transaction right after that device's sends, so a run that is
cut off keeps everything it already delivered and the next run carries on from
there. A 404 or 410 from a push service deletes the device.

A call must end inside the platform's duration limit, so sending stops once
``SEND_BUDGET_SECONDS`` have passed since the run began. What is left stays
unsent and unrecorded, which makes it new again on the next run.

The daily run is safe to repeat (Vercel can deliver a cron twice): each device
keeps the keys of what it was told, and only new keys send anything.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from time import monotonic

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from ledger_sync.core.push_alerts import collect_alerts
from ledger_sync.core.push_sender import Delivery, PushMessage, PushTarget, deliver
from ledger_sync.core.push_vapid import VapidKeys
from ledger_sync.db._models.push_subscriptions import utc_now
from ledger_sync.db.models import PushSubscription, User

TEST_MESSAGE = PushMessage(
    kind="test",
    title="Test alert",
    body="Ledger Sync alerts look like this. They never show amounts.",
    path="/settings",
    ttl=300,
)
# Time to send, counted from the start of the run. The function's Max Duration is a
# Vercel project setting (Settings > Functions; vercel.json's legacy builds cannot
# carry one) and is short on a project without Fluid compute, so the run ends on its
# own terms. A slow database wake-up eats into the budget, and a request already
# under way can still run on past it.
SEND_BUDGET_SECONDS = 8.0
# The rows were read before the sends; nothing in the session needs syncing.
_BULK = {"synchronize_session": False}


@dataclass
class DeliveryReport:
    sent: int = 0
    failed: int = 0
    removed: int = 0
    users: int = 0
    devices: int = 0
    up_to_date: int = 0
    # Messages not attempted because the budget was spent; the next run sends them.
    deferred: int = 0


@dataclass(frozen=True, slots=True)
class _Plan:
    target: PushTarget
    messages: tuple[PushMessage, ...]
    told: frozenset[str] = frozenset()
    # Keys per alert kind now; None for a test, which leaves the stored keys alone.
    current: dict[str, frozenset[str]] | None = None


@dataclass(frozen=True, slots=True)
class _Outcome:
    plan: _Plan
    gone: bool = False
    delivered: bool = False
    keys: frozenset[str] | None = None


def _target(row: PushSubscription) -> PushTarget:
    return PushTarget(row.id, row.user_id, row.endpoint, row.p256dh_key, row.auth_key)


def _told(raw: str | None) -> frozenset[str]:
    try:
        value = json.loads(raw or "[]")
    except ValueError:
        return frozenset()
    if not isinstance(value, list):
        return frozenset()
    return frozenset(item for item in value if isinstance(item, str))


def _send(
    plan: _Plan, vapid: VapidKeys, app_url: str, report: DeliveryReport, deadline: float
) -> _Outcome:
    delivered: set[str] = set()
    for message in plan.messages:
        if monotonic() >= deadline:
            report.deferred += 1
            continue
        result = deliver(plan.target, message, vapid, app_url)
        if result is Delivery.GONE:
            report.removed += 1
            return _Outcome(plan, gone=True)
        if result is Delivery.SENT:
            report.sent += 1
            delivered.add(message.kind)
        else:
            report.failed += 1
    if plan.current is None:
        return _Outcome(plan, delivered=bool(delivered))
    keys: set[str] = set()
    for kind, current in plan.current.items():
        # A kind whose send failed keeps only what the device already heard,
        # so its new items are still new on the next run.
        heard = kind in delivered or not current - plan.told
        keys |= current if heard else current & plan.told
    return _Outcome(plan, delivered=bool(delivered), keys=frozenset(keys))


def _record(db: Session, outcome: _Outcome) -> None:
    target = outcome.plan.target
    owned = (PushSubscription.id == target.id, PushSubscription.user_id == target.user_id)
    if outcome.gone:
        db.execute(delete(PushSubscription).where(*owned).execution_options(**_BULK))
        return
    values: dict[str, object] = {}
    if outcome.delivered:
        values["last_success_at"] = utc_now()
    if outcome.keys is not None and outcome.keys != outcome.plan.told:
        values["alert_keys"] = json.dumps(sorted(outcome.keys))
    if values:
        stmt = update(PushSubscription).where(*owned).values(**values)
        db.execute(stmt.execution_options(**_BULK))


def _deliver_all(
    db: Session,
    plans: list[_Plan],
    vapid: VapidKeys,
    app_url: str,
    report: DeliveryReport,
    deadline: float,
) -> DeliveryReport:
    db.rollback()  # the reads are done: no transaction stays open during the sends
    report.devices = len(plans)
    for plan in plans:
        _record(db, _send(plan, vapid, app_url, report, deadline))
        db.commit()  # this device is saved even if the run is cut off after it
    return report


def send_test(
    db: Session, user_id: int, vapid: VapidKeys, app_url: str, device_id: int | None = None
) -> DeliveryReport:
    """Send the test message to one of the user's devices, or to all of them."""
    deadline = monotonic() + SEND_BUDGET_SECONDS
    stmt = select(PushSubscription).where(PushSubscription.user_id == user_id)
    if device_id is not None:
        stmt = stmt.where(PushSubscription.id == device_id)
    rows = db.scalars(stmt.order_by(PushSubscription.id)).all()
    if device_id is not None and not rows:
        raise LookupError("No such device")
    plans = [_Plan(_target(row), (TEST_MESSAGE,)) for row in rows]
    return _deliver_all(db, plans, vapid, app_url, DeliveryReport(users=1), deadline)


def run_due_alerts(db: Session, vapid: VapidKeys, app_url: str, now: datetime) -> DeliveryReport:
    """Tell each device what is new for its user since that device's last alert."""
    deadline = monotonic() + SEND_BUDGET_SECONDS
    report = DeliveryReport()
    by_user: dict[int, list[PushSubscription]] = {}
    for row in db.scalars(select(PushSubscription).order_by(PushSubscription.id)):
        by_user.setdefault(row.user_id, []).append(row)
    plans: list[_Plan] = []
    for user_id, rows in by_user.items():
        user = db.get(User, user_id)
        if user is None or not user.is_active:
            continue
        report.users += 1
        alerts = collect_alerts(db, user, now)
        # The badge counts everything flagged now, not only what is new.
        badge = sum(alert.count for alert in alerts)
        current = {alert.kind: alert.keys for alert in alerts}
        for row in rows:
            told = _told(row.alert_keys)
            messages = tuple(
                PushMessage(alert.kind, alert.title, alert.body, alert.path, badge=badge)
                for alert in alerts
                if alert.keys - told
            )
            plans.append(_Plan(_target(row), messages, told, current))
    report.up_to_date = sum(1 for plan in plans if not plan.messages)
    return _deliver_all(db, plans, vapid, app_url, report, deadline)

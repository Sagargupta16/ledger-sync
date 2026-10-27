"""Encrypt and send one Web Push message, and read the reply.

The payload is encrypted and the request signed in ``push_crypto`` (RFC 8291
and RFC 8292), then posted with httpx without following redirects.

Every message is Declarative Web Push JSON (``web_push: 8030``). iOS and iPadOS
18.4+ Home Screen apps show it without running any service worker code; older
iOS, Android and desktop browsers hand the same JSON to the push handler in
``frontend/public/push-sw.js``. A message carries a title, a short body without
amounts (it shows on the lock screen), the deep link, a tag and, for alerts, the
badge count. Endpoint URLs and keys are never logged.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from enum import StrEnum
from urllib.parse import urlsplit

import httpx

from ledger_sync.core.push_crypto import encrypt_message, vapid_authorization
from ledger_sync.core.push_vapid import VapidKeys

logger = logging.getLogger(__name__)

DECLARATIVE_WEB_PUSH = 8030
# Short: a daily run sends one device after another inside one function call.
SEND_TIMEOUT_SECONDS = 5
ICON_FILE = "pwa-192x192.png"
_GONE_STATUSES = frozenset({404, 410})
# Only real push services are ever posted to, so a stored endpoint cannot turn
# the alert sender into a request to some other host.
_PUSH_HOSTS = frozenset(
    {
        "fcm.googleapis.com",
        "android.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
    }
)
_PUSH_HOST_SUFFIXES = (".push.apple.com", ".notify.windows.com", ".push.services.mozilla.com")


@dataclass(frozen=True, slots=True)
class PushTarget:
    id: int
    user_id: int
    # The endpoint and keys are secrets of the device: out of repr, like the VAPID key.
    endpoint: str = field(repr=False)
    p256dh: str = field(repr=False)
    auth: str = field(repr=False)


@dataclass(frozen=True, slots=True)
class PushMessage:
    kind: str  # the Topic header and the tag suffix: repeats replace each other
    title: str
    body: str
    path: str  # an app route such as "/bill-calendar"
    badge: int | None = None
    ttl: int = 86_400


class Delivery(StrEnum):
    SENT = "sent"
    GONE = "gone"  # 404 or 410: the subscription no longer exists
    FAILED = "failed"


def is_push_service_endpoint(endpoint: str) -> bool:
    """True for an https endpoint at a known browser push service."""
    try:
        parts = urlsplit(endpoint)
        port = parts.port
    except ValueError:
        return False
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or parts.username or parts.password or port not in (None, 443):
        return False
    return host in _PUSH_HOSTS or host.endswith(_PUSH_HOST_SUFFIXES)


def message_json(message: PushMessage, app_url: str) -> str:
    """The declarative push JSON; the service worker reads the same fields."""
    base = app_url.rstrip("/")
    notification: dict[str, object] = {
        "title": message.title,
        "body": message.body,
        "navigate": f"{base}{message.path}",
        "tag": f"ledger-sync-{message.kind}",
        "icon": f"{base}/{ICON_FILE}",
        "lang": "en-IN",
        "dir": "ltr",
        "silent": False,
        "data": {"kind": message.kind},
    }
    payload: dict[str, object] = {"web_push": DECLARATIVE_WEB_PUSH, "notification": notification}
    if message.badge is not None:
        badge = str(message.badge)
        # Top level is where the spec and current WebKit read it; the iOS 18.4
        # announcement showed it inside the notification, so send both.
        payload["app_badge"] = badge
        notification["app_badge"] = badge
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def deliver(target: PushTarget, message: PushMessage, vapid: VapidKeys, app_url: str) -> Delivery:
    """Send one message to one device and say whether to keep the subscription."""
    try:
        body = encrypt_message(message_json(message, app_url).encode(), target.p256dh, target.auth)
        response = httpx.post(
            target.endpoint,
            content=body,
            headers={
                "Authorization": vapid_authorization(target.endpoint, vapid),
                "Content-Encoding": "aes128gcm",
                "Content-Type": "application/octet-stream",
                "TTL": str(message.ttl),
                "Topic": message.kind,
                "Urgency": "normal",
            },
            timeout=SEND_TIMEOUT_SECONDS,
            follow_redirects=False,
        )
    except Exception as exc:
        # Connection errors are httpx.HTTPError and bad device keys ValueError or
        # a cryptography error. Whatever it is, one device must never stop the
        # run for the others. Only the type is logged: the message of such an
        # error can carry the endpoint URL.
        logger.warning("Push to device %s failed: %s", target.id, type(exc).__name__)
        return Delivery.FAILED
    if response.status_code in _GONE_STATUSES:
        return Delivery.GONE
    if not response.is_success:
        logger.warning(
            "Push to device %s was refused with HTTP %s", target.id, response.status_code
        )
        return Delivery.FAILED
    return Delivery.SENT

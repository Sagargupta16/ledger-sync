"""Request and response bodies for ``/api/push`` (Web Push alerts)."""

from __future__ import annotations

import base64

from cryptography.hazmat.primitives.asymmetric import ec
from pydantic import BaseModel, Field, field_validator

from ledger_sync.db._models.push_subscriptions import ENDPOINT_MAX_LENGTH

_BASE64URL = r"^[A-Za-z0-9_-]+={0,2}$"
# Device ids are 32-bit integers, so a bigger value can never match a row. Past 64 bits
# SQLite raises OverflowError (a 500) instead of answering "not found".
DEVICE_ID_MAX = 2_147_483_647


def _decode(value: str) -> bytes:
    """Base64url with or without padding; a bad length raises ValueError."""
    trimmed = value.rstrip("=")
    return base64.urlsafe_b64decode(trimmed + "=" * (-len(trimmed) % 4))


class PushKeys(BaseModel):
    """``PushSubscription.toJSON().keys``: the browser's public encryption keys."""

    p256dh: str = Field(min_length=86, max_length=90, pattern=_BASE64URL)
    auth: str = Field(min_length=21, max_length=26, pattern=_BASE64URL)

    @field_validator("p256dh")
    @classmethod
    def _p256dh_is_a_p256_point(cls, value: str) -> str:
        raw = _decode(value)
        if len(raw) != 65 or raw[0] != 4:
            raise ValueError("p256dh must be an uncompressed P-256 public key")
        try:  # a stored key off the curve would fail every send and never be pruned
            ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), raw)
        except ValueError as exc:
            raise ValueError("p256dh is not a point on the P-256 curve") from exc
        return value.rstrip("=")

    @field_validator("auth")
    @classmethod
    def _auth_is_16_bytes(cls, value: str) -> str:
        if len(_decode(value)) != 16:
            raise ValueError("auth must be 16 bytes")
        return value.rstrip("=")


class PushSubscriptionCreate(BaseModel):
    endpoint: str = Field(min_length=1, max_length=ENDPOINT_MAX_LENGTH)
    keys: PushKeys
    # Shown in the device list, e.g. "iPhone app" or "Chrome on Android".
    label: str = Field(min_length=1, max_length=60)

    @field_validator("label")
    @classmethod
    def _single_line(cls, value: str) -> str:
        label = " ".join(value.split())
        if not label:
            raise ValueError("label must not be blank")
        return label


class PushEndpoint(BaseModel):
    endpoint: str = Field(min_length=1, max_length=ENDPOINT_MAX_LENGTH)


class PushTestRequest(BaseModel):
    """Omit ``device_id`` to send the test to every device of the user."""

    device_id: int | None = Field(default=None, ge=1, le=DEVICE_ID_MAX)


class PushDevice(BaseModel):
    id: int
    label: str
    # SHA-256 of the endpoint, so a browser can find its own row.
    endpoint_hash: str
    created_at: str
    last_success_at: str | None


class PushDeviceList(BaseModel):
    devices: list[PushDevice]
    limit: int


class PushConfig(BaseModel):
    """Whether alerts can be sent, and why not; never a secret."""

    enabled: bool
    # The daily run also needs CRON_SECRET; tests work without it.
    daily_alerts: bool
    public_key: str | None
    missing: list[str]
    reason: str | None


class PushDeliveryReport(BaseModel):
    sent: int
    failed: int
    removed: int


class PushRunReport(PushDeliveryReport):
    users: int
    devices: int
    up_to_date: int
    # Messages left for the next run because this one used up its time budget.
    deferred: int

"""Load and check the VAPID key pair that signs every push this server sends.

The keys come from ``config/push_settings.py``. The private key may be the raw
32-byte base64url form most generators print, base64url DER or a PEM block; the
public key must be the P-256 point that private key derives, or every push
service would reject the signature. Errors name variables, never values.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field

from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from ledger_sync.config.push_settings import (
    PRIVATE_KEY_ENV,
    PUBLIC_KEY_ENV,
    SUBJECT_ENV,
    PushSettings,
    push_settings,
)


class PushNotConfiguredError(RuntimeError):
    """The server cannot send pushes; ``missing`` lists unset variable names."""

    def __init__(self, message: str, missing: list[str] | None = None) -> None:
        super().__init__(message)
        self.missing = missing or []


@dataclass(frozen=True, slots=True)
class VapidKeys:
    # base64url of the raw 32-byte key, the form pywebpush loads; kept out of repr
    # so a stray f-string, assert message or error report cannot print it.
    private_key: str = field(repr=False)
    public_key: str
    subject: str


def b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _private_scalar(value: str) -> bytes:
    """The raw 32-byte private key from raw base64url, base64url DER or PEM."""
    if "-----BEGIN" in value:
        key = serialization.load_pem_private_key(value.encode(), password=None)
    else:
        raw = b64url_decode("".join(value.split()))
        if len(raw) == 32:
            return raw
        key = serialization.load_der_private_key(raw, password=None)
    if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
        raise ValueError("not a P-256 key")
    return key.private_numbers().private_value.to_bytes(32, "big")


def _joined(names: list[str]) -> str:
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def load_vapid(settings: PushSettings = push_settings) -> VapidKeys:
    """The usable key pair, or ``PushNotConfiguredError`` saying what to fix."""
    missing = settings.missing_vapid()
    if missing:
        verb = "is" if len(missing) == 1 else "are"
        raise PushNotConfiguredError(
            f"Phone alerts are off until {_joined(missing)} {verb} set on the server.", missing
        )
    public_key = settings.vapid_public_key.strip()
    try:  # base64 errors are ValueErrors too
        public_raw = b64url_decode(public_key)
        ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), public_raw)
    except ValueError as exc:
        raise PushNotConfiguredError(f"{PUBLIC_KEY_ENV} is not a P-256 public key.") from exc
    try:
        scalar = _private_scalar(settings.vapid_private_key.get_secret_value().strip())
        derived = ec.derive_private_key(int.from_bytes(scalar, "big"), ec.SECP256R1())
    except (ValueError, TypeError, UnsupportedAlgorithm) as exc:
        raise PushNotConfiguredError(f"{PRIVATE_KEY_ENV} is not a P-256 private key.") from exc
    point = derived.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    if point != public_raw:
        raise PushNotConfiguredError(
            f"{PUBLIC_KEY_ENV} does not belong to {PRIVATE_KEY_ENV}. Set both from one key pair."
        )
    subject = settings.vapid_subject.strip()
    if not (subject.startswith("https://") or (subject.startswith("mailto:") and "@" in subject)):
        raise PushNotConfiguredError(f"{SUBJECT_ENV} must be a mailto: address or an https URL.")
    return VapidKeys(private_key=_b64url(scalar), public_key=public_key, subject=subject)

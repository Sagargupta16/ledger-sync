"""Web Push message encryption (RFC 8291) and VAPID authorization (RFC 8292).

Built on ``cryptography`` and PyJWT, which the backend already ships, instead of
pywebpush: its ``http-ece`` dependency publishes no wheel, and the backend
installs wheels only. One message is one ``aes128gcm`` record (RFC 8188) under a
fresh sender key and salt; the VAPID token is an ES256 JWT for the push
service's origin that expires within the 24 hours RFC 8292 allows.
"""

from __future__ import annotations

import os
import time
from urllib.parse import urlsplit

import jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from ledger_sync.core.push_vapid import VapidKeys, b64url_decode

#: One record holds the whole message, so the record size only needs to fit it.
RECORD_SIZE = 4096
_TAG_LENGTH = 16
_LAST_RECORD_DELIMITER = b"\x02"
#: Shorter than the 24-hour ceiling, so clock skew never makes a token too long.
VAPID_TOKEN_SECONDS = 12 * 60 * 60


def _hkdf(salt: bytes, info: bytes, length: int, key_material: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(key_material)


def _point(key: ec.EllipticCurvePublicKey) -> bytes:
    return key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )


def encrypt_message(
    plaintext: bytes,
    p256dh: str,
    auth: str,
    *,
    salt: bytes | None = None,
    sender_key: ec.EllipticCurvePrivateKey | None = None,
) -> bytes:
    """The ``aes128gcm`` body for one subscription (header, then the one record).

    ``salt`` and ``sender_key`` are fresh per message; they are parameters only
    so the RFC 8291 test vector can be reproduced.
    """
    if len(plaintext) + len(_LAST_RECORD_DELIMITER) + _TAG_LENGTH > RECORD_SIZE:
        raise ValueError("A push message must fit in one 4096-octet record.")
    ua_public = b64url_decode(p256dh)
    auth_secret = b64url_decode(auth)
    receiver = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    sender = sender_key or ec.generate_private_key(ec.SECP256R1())
    as_public = _point(sender.public_key())
    ecdh_secret = sender.exchange(ec.ECDH(), receiver)
    ikm = _hkdf(auth_secret, b"WebPush: info\x00" + ua_public + as_public, 32, ecdh_secret)
    salt = salt if salt is not None else os.urandom(16)
    cek = _hkdf(salt, b"Content-Encoding: aes128gcm\x00", 16, ikm)
    nonce = _hkdf(salt, b"Content-Encoding: nonce\x00", 12, ikm)
    record = AESGCM(cek).encrypt(nonce, plaintext + _LAST_RECORD_DELIMITER, None)
    header = salt + RECORD_SIZE.to_bytes(4, "big") + bytes([len(as_public)]) + as_public
    return header + record


def vapid_authorization(endpoint: str, vapid: VapidKeys, now: float | None = None) -> str:
    """The ``Authorization`` header value for a push to ``endpoint``."""
    parts = urlsplit(endpoint)
    issued = int(time.time() if now is None else now)
    claims = {
        "aud": f"{parts.scheme}://{parts.netloc}",
        "exp": issued + VAPID_TOKEN_SECONDS,
        "sub": vapid.subject,
    }
    scalar = int.from_bytes(b64url_decode(vapid.private_key), "big")
    signing_key = ec.derive_private_key(scalar, ec.SECP256R1())
    token = jwt.encode(claims, signing_key, algorithm="ES256")
    return f"vapid t={token}, k={vapid.public_key}"

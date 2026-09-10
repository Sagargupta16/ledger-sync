"""Authenticated encryption for stored BYOK keys.

New writes use ``ls-byok:v3:`` followed by base64(salt, nonce, ciphertext).
The non-base64 envelope cannot collide with legacy random salt bytes; the
version is also authenticated as GCM associated data. v1 (PBKDF2) and v2
(HKDF with a single-byte marker) remain read-only formats.

Every candidate key and legacy format must pass GCM authentication. Reads
using a legacy format or the JWT fallback request rewrapping with the current
dedicated encryption key. Keep the old key available until rewrapping is
complete; changing a secret cannot recover ciphertext encrypted with it.
"""

from __future__ import annotations

import base64
import binascii
import logging
import os
from collections.abc import Sequence

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from ledger_sync.config.settings import settings

logger = logging.getLogger(__name__)

_SALT_LENGTH = 16
_NONCE_LENGTH = 12
_TAG_LENGTH = 16
_KEY_LENGTH = 32
_LEGACY_ITERATIONS = 100_000
_V2_PREFIX = bytes([2])
_V2_HKDF_INFO = b"ledger-sync/byok-api-key/v2"
_V3_PREFIX = "ls-byok:v3:"
_V3_HKDF_INFO = b"ledger-sync/byok-api-key/v3"


class DecryptionError(Exception):
    """The ciphertext is invalid or no available key can authenticate it."""


def _key_materials(previous_keys: Sequence[str] = ()) -> list[bytes]:
    """Preferred material first, followed by authenticated read fallbacks."""
    values = (settings.encryption_key, settings.jwt_secret_key, *previous_keys)
    materials = list(dict.fromkeys(value.encode() for value in values if value))
    if not materials:
        raise DecryptionError("No encryption key material is configured")
    return materials


def _derive_key(salt: bytes, material: bytes, version: int) -> bytes:
    if version == 1:
        return PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=_KEY_LENGTH,
            salt=salt,
            iterations=_LEGACY_ITERATIONS,
        ).derive(material)
    return HKDF(
        algorithm=hashes.SHA256(),
        length=_KEY_LENGTH,
        salt=salt,
        info=_V3_HKDF_INFO if version == 3 else _V2_HKDF_INFO,
    ).derive(material)


def encrypt_api_key(plaintext: str) -> str:
    """Encrypt a new value using the preferred key and authenticated v3 envelope."""
    if not settings.encryption_key:
        logger.warning(
            "LEDGER_SYNC_ENCRYPTION_KEY is not set; stored API keys still depend "
            "on the JWT secret. Configure a dedicated key before rotating JWT secrets."
        )
    salt = os.urandom(_SALT_LENGTH)
    nonce = os.urandom(_NONCE_LENGTH)
    key = _derive_key(salt, _key_materials()[0], 3)
    ciphertext = AESGCM(key).encrypt(nonce, plaintext.encode(), _V3_PREFIX.encode())
    return _V3_PREFIX + base64.b64encode(salt + nonce + ciphertext).decode()


def _decode_body(encoded: str) -> bytes:
    try:
        return base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise DecryptionError("API key ciphertext is not valid base64") from exc


def _try_decrypt(body: bytes, material: bytes, version: int) -> str | None:
    if len(body) < _SALT_LENGTH + _NONCE_LENGTH + _TAG_LENGTH:
        return None
    salt = body[:_SALT_LENGTH]
    nonce = body[_SALT_LENGTH : _SALT_LENGTH + _NONCE_LENGTH]
    ciphertext = body[_SALT_LENGTH + _NONCE_LENGTH :]
    key = _derive_key(salt, material, version)
    associated_data = _V3_PREFIX.encode() if version == 3 else None
    try:
        return AESGCM(key).decrypt(nonce, ciphertext, associated_data).decode()
    except (InvalidTag, UnicodeDecodeError, ValueError):
        return None


def decrypt_api_key(encrypted: str, *, previous_keys: Sequence[str] = ()) -> tuple[str, bool]:
    """Return plaintext and whether it needs rewrapping with the current key.

    ``previous_keys`` is for an operator-controlled rotation, never client input.
    The normal read path also tries the JWT secret to support introducing a
    dedicated key after v1, v2, or v3 fallback writes.
    """
    if encrypted.startswith(_V3_PREFIX):
        candidates = [(3, _decode_body(encrypted[len(_V3_PREFIX) :]))]
    elif encrypted.startswith("ls-byok:"):
        raise DecryptionError("Unsupported API key ciphertext version")
    else:
        raw = _decode_body(encrypted)
        candidates = [(2, raw[1:]), (1, raw)] if raw[:1] == _V2_PREFIX else [(1, raw)]

    for version, body in candidates:
        for index, material in enumerate(_key_materials(previous_keys)):
            plaintext = _try_decrypt(body, material, version)
            if plaintext is not None:
                return plaintext, version != 3 or index != 0

    raise DecryptionError(
        "Cannot decrypt the stored API key with the available encryption keys. "
        "Restore the previous encryption key for rewrapping or re-enter the key in Settings."
    )


def rewrap_api_key(encrypted: str, *, previous_keys: Sequence[str] = ()) -> str:
    """Authenticate an existing value and encrypt it with the current key."""
    plaintext, _ = decrypt_api_key(encrypted, previous_keys=previous_keys)
    return encrypt_api_key(plaintext)

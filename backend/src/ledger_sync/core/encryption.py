"""AES-256-GCM encryption for at-rest secret storage (BYOK API keys).

## Two ciphertext formats coexist during rollout

- **v1 (legacy)**: `base64(salt(16) || nonce(12) || ciphertext)`
  KDF is PBKDF2-HMAC-SHA256 (100k iterations) over `settings.jwt_secret_key`.
  Written by the pre-2026-07 code path.

- **v2 (current)**: `base64(0x02 || salt(16) || nonce(12) || ciphertext)`
  KDF is HKDF-SHA256 over `settings.encryption_key` (fallback: jwt_secret_key).
  HKDF is the correct primitive here -- the input material is already a
  high-entropy server secret (KEK), not a low-entropy user password, so the
  iteration-count knob PBKDF2 exists for is doing nothing useful.

Decryption tries v2 first (by prefix byte), then legacy. Every legacy read
returns `needs_reencrypt=True` so the caller can transparently upgrade the
stored ciphertext -- see `preferences_ai.get_ai_key` for the pattern.

## Why the key material is separate

Right now `jwt_secret_key` triple-duties as JWT signer, OAuth state HMAC key,
and BYOK KEK. Rotating the JWT secret for token security reasons would silently
invalidate every stored BYOK key (DecryptionError). Splitting via a dedicated
`encryption_key` decouples those two rotation policies.

Rollout: deploy with `LEDGER_SYNC_ENCRYPTION_KEY` set on Vercel; existing v1
ciphertexts decrypt on next reveal and are re-written as v2 in-band. After
30 days of clean access logs (no v1 reads), the legacy branch can be removed.
"""

from __future__ import annotations

import base64
import logging
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from ledger_sync.config.settings import settings

logger = logging.getLogger(__name__)

_SALT_LENGTH = 16  # 128-bit random salt per ciphertext
_NONCE_LENGTH = 12  # 96-bit nonce for GCM (AESGCM recommends 12 bytes)
_KEY_LENGTH = 32  # AES-256
_LEGACY_ITERATIONS = 100_000  # v1 only; v2 uses HKDF which needs no iteration count
_V2_PREFIX = b"\x02"
_V2_HKDF_INFO = b"ledger-sync/byok-api-key/v2"


class DecryptionError(Exception):
    """Raised when decryption fails (e.g. key changed between restarts)."""


def _kek_material() -> bytes:
    """Return the KEK bytes for v2 encryption.

    Prefer the dedicated encryption_key; fall back to jwt_secret_key with a
    warning (deprecated during rollout, removed once all v1 ciphertexts have
    been re-wrapped as v2).
    """
    if settings.encryption_key:
        return settings.encryption_key.encode()
    if settings.jwt_secret_key:
        logger.warning(
            "LEDGER_SYNC_ENCRYPTION_KEY is not set; falling back to jwt_secret_key "
            "as the BYOK KEK. Set a dedicated encryption key to decouple JWT rotation "
            "from stored API keys."
        )
        return settings.jwt_secret_key.encode()
    # Both empty -- only reachable in a broken dev environment.
    msg = "No key material configured (neither encryption_key nor jwt_secret_key set)"
    raise DecryptionError(msg)


def _derive_key_v2(salt: bytes, material: bytes) -> bytes:
    """HKDF-SHA256 key derivation for v2 ciphertexts.

    HKDF (RFC 5869) is the correct primitive when the input material is
    already a strong key. Info parameter provides domain separation so the
    same secret could safely derive keys for other purposes.
    """
    return HKDF(
        algorithm=hashes.SHA256(),
        length=_KEY_LENGTH,
        salt=salt,
        info=_V2_HKDF_INFO,
    ).derive(material)


def _derive_key_v1(salt: bytes, material: bytes) -> bytes:
    """Legacy PBKDF2-HMAC-SHA256 for v1 ciphertexts. Read-only path."""
    return PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=_KEY_LENGTH,
        salt=salt,
        iterations=_LEGACY_ITERATIONS,
    ).derive(material)


def encrypt_api_key(plaintext: str) -> str:
    """Encrypt with the current (v2) format. New writes always use v2."""
    salt = os.urandom(_SALT_LENGTH)
    nonce = os.urandom(_NONCE_LENGTH)
    key = _derive_key_v2(salt, _kek_material())
    ciphertext = AESGCM(key).encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(_V2_PREFIX + salt + nonce + ciphertext).decode()


def decrypt_api_key(encrypted: str) -> tuple[str, bool]:
    """Decrypt a v1 or v2 ciphertext.

    Returns:
        (plaintext, needs_reencrypt). If `needs_reencrypt` is True, the caller
        should re-write the stored ciphertext with a fresh `encrypt_api_key`
        call so v1 blobs get transparently upgraded.

    Raises:
        DecryptionError: if the ciphertext is malformed or the key is wrong.
    """
    try:
        raw = base64.b64decode(encrypted)
    except Exception as exc:
        raise DecryptionError("API key ciphertext is not valid base64") from exc

    if raw[:1] == _V2_PREFIX:
        return _decrypt_v2(raw[1:]), False

    return _decrypt_v1(raw), True  # legacy blob -> upgrade on next write


def _decrypt_v2(body: bytes) -> str:
    if len(body) < _SALT_LENGTH + _NONCE_LENGTH:
        raise DecryptionError("v2 ciphertext is truncated")
    salt = body[:_SALT_LENGTH]
    nonce = body[_SALT_LENGTH : _SALT_LENGTH + _NONCE_LENGTH]
    ciphertext = body[_SALT_LENGTH + _NONCE_LENGTH :]
    key = _derive_key_v2(salt, _kek_material())
    try:
        return AESGCM(key).decrypt(nonce, ciphertext, None).decode()
    except Exception as exc:
        raise DecryptionError(
            "Cannot decrypt v2 API key -- the encryption key likely changed since "
            "the key was saved. Please re-enter your API key in Settings."
        ) from exc


def _decrypt_v1(raw: bytes) -> str:
    """Legacy PBKDF2 path. Tries encryption_key first (if set) then jwt_secret_key.

    Tries both because during the rollout window, users may have set
    `encryption_key` to the same value as `jwt_secret_key` before we deprecate
    the fallback -- we still need to decrypt old ciphertexts that were written
    when only `jwt_secret_key` existed.
    """
    if len(raw) < _SALT_LENGTH + _NONCE_LENGTH:
        raise DecryptionError("v1 ciphertext is truncated")
    salt = raw[:_SALT_LENGTH]
    nonce = raw[_SALT_LENGTH : _SALT_LENGTH + _NONCE_LENGTH]
    ciphertext = raw[_SALT_LENGTH + _NONCE_LENGTH :]

    candidates: list[bytes] = []
    if settings.encryption_key:
        candidates.append(settings.encryption_key.encode())
    if settings.jwt_secret_key:
        candidates.append(settings.jwt_secret_key.encode())

    last_error: Exception | None = None
    for material in candidates:
        try:
            key = _derive_key_v1(salt, material)
            return AESGCM(key).decrypt(nonce, ciphertext, None).decode()
        except Exception as exc:  # noqa: BLE001 -- try next material
            last_error = exc

    raise DecryptionError(
        "Cannot decrypt legacy (v1) API key -- neither the encryption key nor "
        "the JWT secret unlocks it. Please re-enter your API key in Settings."
    ) from last_error

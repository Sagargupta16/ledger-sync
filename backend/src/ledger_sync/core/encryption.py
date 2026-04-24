"""AES-256-GCM encryption for API key storage.

Uses PBKDF2-HMAC-SHA256 to derive an encryption key from the application's
JWT secret, combined with a per-ciphertext random salt. The salt is stored
alongside the nonce and ciphertext so decryption can recover the same key.

Output format (base64-encoded): salt(16) || nonce(12) || ciphertext
"""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from ledger_sync.config.settings import settings

_SALT_LENGTH = 16  # 128-bit random salt per ciphertext
_ITERATIONS = 100_000
_KEY_LENGTH = 32  # AES-256
_NONCE_LENGTH = 12  # 96-bit nonce for GCM


def _derive_key(salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=_KEY_LENGTH,
        salt=salt,
        iterations=_ITERATIONS,
    )
    return kdf.derive(settings.jwt_secret_key.encode())


def encrypt_api_key(plaintext: str) -> str:
    salt = os.urandom(_SALT_LENGTH)
    nonce = os.urandom(_NONCE_LENGTH)
    key = _derive_key(salt)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(salt + nonce + ciphertext).decode()


class DecryptionError(Exception):
    """Raised when decryption fails (e.g. key changed between restarts)."""


def decrypt_api_key(encrypted: str) -> str:
    raw = base64.b64decode(encrypted)
    salt = raw[:_SALT_LENGTH]
    nonce = raw[_SALT_LENGTH : _SALT_LENGTH + _NONCE_LENGTH]
    ciphertext = raw[_SALT_LENGTH + _NONCE_LENGTH :]
    key = _derive_key(salt)
    aesgcm = AESGCM(key)
    try:
        return aesgcm.decrypt(nonce, ciphertext, None).decode()
    except Exception as exc:
        raise DecryptionError(
            "Cannot decrypt API key -- the server secret likely changed since the key "
            "was saved. Please re-enter your API key in Settings."
        ) from exc

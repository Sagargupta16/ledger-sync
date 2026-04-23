"""AES-256-GCM encryption for API key storage."""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from ledger_sync.config.settings import settings

_SALT = b"ledger-sync-api-key-encryption-v1"
_ITERATIONS = 100_000
_KEY_LENGTH = 32  # AES-256
_NONCE_LENGTH = 12  # 96-bit nonce for GCM


def _derive_key() -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=_KEY_LENGTH,
        salt=_SALT,
        iterations=_ITERATIONS,
    )
    return kdf.derive(settings.jwt_secret_key.encode())


def encrypt_api_key(plaintext: str) -> str:
    key = _derive_key()
    nonce = os.urandom(_NONCE_LENGTH)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()


class DecryptionError(Exception):
    """Raised when decryption fails (e.g. key changed between restarts)."""


def decrypt_api_key(encrypted: str) -> str:
    key = _derive_key()
    raw = base64.b64decode(encrypted)
    nonce = raw[:_NONCE_LENGTH]
    ciphertext = raw[_NONCE_LENGTH:]
    aesgcm = AESGCM(key)
    try:
        return aesgcm.decrypt(nonce, ciphertext, None).decode()
    except Exception as exc:
        raise DecryptionError(
            "Cannot decrypt API key -- the server secret likely changed since the key "
            "was saved. Please re-enter your API key in Settings."
        ) from exc

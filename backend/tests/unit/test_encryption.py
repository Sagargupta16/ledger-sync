"""Tests for AES-256-GCM API key encryption -- v2 (HKDF) with v1 (PBKDF2) fallback."""

from __future__ import annotations

import base64

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from ledger_sync.core.encryption import (
    DecryptionError,
    decrypt_api_key,
    encrypt_api_key,
)


def test_round_trip():
    key = "sk-ant-api03-reallyLongKeyHere12345"
    encrypted = encrypt_api_key(key)
    assert encrypted != key
    plaintext, needs_reencrypt = decrypt_api_key(encrypted)
    assert plaintext == key
    # New writes are always v2, so no upgrade needed.
    assert needs_reencrypt is False


def test_different_nonces():
    """Identical plaintext produces different ciphertexts (random nonce + salt)."""
    key = "sk-test-key-123"
    e1 = encrypt_api_key(key)
    e2 = encrypt_api_key(key)
    assert e1 != e2


def test_empty_key():
    encrypted = encrypt_api_key("")
    plaintext, _ = decrypt_api_key(encrypted)
    assert plaintext == ""


def test_v2_ciphertext_has_version_prefix():
    """Every new ciphertext starts with the v2 prefix byte 0x02 (post-base64)."""
    encrypted = encrypt_api_key("sk-test")
    raw = base64.b64decode(encrypted)
    assert raw[:1] == b"\x02"


def test_legacy_v1_ciphertext_decrypts_and_flags_reencrypt():
    """v1 (pre-2026-07) ciphertext still decrypts but signals it needs an upgrade.

    Recreates the exact byte layout the old encryption.py produced so we can
    prove the fallback branch works without depending on git-history code.
    """
    from ledger_sync.config.settings import settings

    plaintext = "sk-legacy-key"
    salt = b"\x01" * 16
    nonce = b"\x02" * 12

    # Legacy KDF: PBKDF2-HMAC-SHA256 over jwt_secret_key with 100k iterations.
    material = (settings.encryption_key or settings.jwt_secret_key).encode()
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key = kdf.derive(material)
    ciphertext = AESGCM(key).encrypt(nonce, plaintext.encode(), None)
    legacy_blob = base64.b64encode(salt + nonce + ciphertext).decode()

    decrypted, needs_reencrypt = decrypt_api_key(legacy_blob)
    assert decrypted == plaintext
    assert needs_reencrypt is True


def test_malformed_ciphertext_raises_decryption_error():
    with pytest.raises(DecryptionError):
        decrypt_api_key("not-valid-base64!!!!")


def test_truncated_ciphertext_raises_decryption_error():
    """A base64-valid but too-short blob is caught, not a mystery IndexError."""
    truncated = base64.b64encode(b"\x02" + b"\x00" * 5).decode()
    with pytest.raises(DecryptionError):
        decrypt_api_key(truncated)

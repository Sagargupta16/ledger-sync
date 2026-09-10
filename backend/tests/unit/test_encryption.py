"""Tests for authenticated envelopes, legacy collisions, and key transitions."""

from __future__ import annotations

import base64

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from ledger_sync.core.encryption import (
    DecryptionError,
    decrypt_api_key,
    encrypt_api_key,
    rewrap_api_key,
)


def test_round_trip():
    key = "sk-ant-api03-reallyLongKeyHere12345"
    encrypted = encrypt_api_key(key)
    assert encrypted != key
    plaintext, needs_reencrypt = decrypt_api_key(encrypted)
    assert plaintext == key
    # New writes use the current envelope, so no upgrade is needed.
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


def test_current_ciphertext_has_unambiguous_version_prefix():
    encrypted = encrypt_api_key("sk-test")
    assert encrypted.startswith("ls-byok:v3:")
    with pytest.raises(ValueError):
        base64.b64decode(encrypted, validate=True)


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


def test_legacy_salt_starting_with_v2_marker_still_authenticates():
    from ledger_sync.config.settings import settings

    salt = b"\x02" + b"\x01" * 15
    nonce = b"\x03" * 12
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000).derive(
        settings.jwt_secret_key.encode()
    )
    ciphertext = AESGCM(key).encrypt(nonce, b"synthetic-legacy-value", None)
    blob = base64.b64encode(salt + nonce + ciphertext).decode()

    assert decrypt_api_key(blob) == ("synthetic-legacy-value", True)


def test_v2_jwt_fallback_survives_introducing_dedicated_key(
    monkeypatch: pytest.MonkeyPatch,
):
    from ledger_sync.config.settings import settings

    monkeypatch.setattr(settings, "jwt_secret_key", "synthetic-original-jwt-material")
    monkeypatch.setattr(settings, "encryption_key", "synthetic-new-dedicated-material")
    salt = b"\x04" * 16
    nonce = b"\x05" * 12
    key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=b"ledger-sync/byok-api-key/v2",
    ).derive(settings.jwt_secret_key.encode())
    ciphertext = AESGCM(key).encrypt(nonce, b"synthetic-v2-value", None)
    blob = base64.b64encode(b"\x02" + salt + nonce + ciphertext).decode()

    assert decrypt_api_key(blob) == ("synthetic-v2-value", True)
    upgraded = rewrap_api_key(blob)
    monkeypatch.setattr(settings, "jwt_secret_key", "synthetic-rotated-jwt-material")
    assert decrypt_api_key(upgraded) == ("synthetic-v2-value", False)


def test_current_jwt_fallback_requests_rewrap_after_dedicated_key_is_set(
    monkeypatch: pytest.MonkeyPatch,
):
    from ledger_sync.config.settings import settings

    monkeypatch.setattr(settings, "encryption_key", "")
    blob = encrypt_api_key("synthetic-fallback-value")
    monkeypatch.setattr(settings, "encryption_key", "synthetic-dedicated-material")

    assert decrypt_api_key(blob) == ("synthetic-fallback-value", True)
    assert decrypt_api_key(rewrap_api_key(blob)) == ("synthetic-fallback-value", False)


def test_explicit_previous_key_can_rewrap_a_dedicated_key_rotation(
    monkeypatch: pytest.MonkeyPatch,
):
    from ledger_sync.config.settings import settings

    previous_material = "synthetic-previous-dedicated-material"
    monkeypatch.setattr(settings, "encryption_key", previous_material)
    blob = encrypt_api_key("synthetic-provider-value")
    monkeypatch.setattr(settings, "encryption_key", "synthetic-new-dedicated-material")

    with pytest.raises(DecryptionError):
        decrypt_api_key(blob)
    upgraded = rewrap_api_key(blob, previous_keys=[previous_material])
    assert decrypt_api_key(upgraded) == ("synthetic-provider-value", False)


@pytest.mark.parametrize("mutation", ["body", "version", "remove_envelope"])
def test_current_ciphertext_tampering_cannot_fall_back_to_legacy(mutation: str):
    blob = encrypt_api_key("synthetic-provider-value")
    if mutation == "body":
        prefix, encoded = blob.rsplit(":", 1)
        raw = bytearray(base64.b64decode(encoded))
        raw[-1] ^= 1
        blob = prefix + ":" + base64.b64encode(raw).decode()
    elif mutation == "version":
        blob = blob.replace(":v3:", ":v2:", 1)
    else:
        blob = blob.rsplit(":", 1)[1]

    with pytest.raises(DecryptionError):
        decrypt_api_key(blob)

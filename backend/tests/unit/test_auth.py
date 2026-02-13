"""Tests for authentication logic."""

import pytest

from ledger_sync.core.auth.passwords import get_password_hash, verify_password
from ledger_sync.core.auth.tokens import create_access_token, create_refresh_token, verify_token


class TestPasswords:
    """Test password hashing and verification."""

    def test_hash_and_verify_correct_password(self):
        password = "test-password-123"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True

    def test_verify_wrong_password(self):
        password = "test-password-123"
        hashed = get_password_hash(password)
        assert verify_password("wrong-password", hashed) is False

    def test_hash_is_not_plaintext(self):
        password = "test-password-123"
        hashed = get_password_hash(password)
        assert hashed != password

    def test_different_passwords_different_hashes(self):
        hash1 = get_password_hash("password1")
        hash2 = get_password_hash("password2")
        assert hash1 != hash2

    def test_same_password_different_hashes(self):
        """Bcrypt should produce different hashes for the same password (different salts)."""
        hash1 = get_password_hash("same-password")
        hash2 = get_password_hash("same-password")
        assert hash1 != hash2


class TestTokens:
    """Test JWT token creation and verification."""

    def test_create_and_verify_access_token(self):
        token = create_access_token(data={"sub": "1", "email": "test@example.com"})
        assert token is not None
        assert isinstance(token, str)

        data = verify_token(token, token_type="access")
        assert data is not None
        assert data.user_id == 1
        assert data.email == "test@example.com"

    def test_create_and_verify_refresh_token(self):
        token = create_refresh_token(data={"sub": "1", "email": "test@example.com"})
        assert token is not None

        data = verify_token(token, token_type="refresh")
        assert data is not None
        assert data.user_id == 1

    def test_access_token_rejected_as_refresh(self):
        token = create_access_token(data={"sub": "1", "email": "test@example.com"})
        data = verify_token(token, token_type="refresh")
        assert data is None

    def test_refresh_token_rejected_as_access(self):
        token = create_refresh_token(data={"sub": "1", "email": "test@example.com"})
        data = verify_token(token, token_type="access")
        assert data is None

    def test_invalid_token_returns_none(self):
        data = verify_token("invalid.token.string", token_type="access")
        assert data is None

    def test_empty_token_returns_none(self):
        data = verify_token("", token_type="access")
        assert data is None

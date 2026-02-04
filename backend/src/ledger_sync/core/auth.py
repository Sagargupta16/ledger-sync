"""Authentication utilities - Backwards compatibility module.

This module re-exports from the new modular auth package for backwards
compatibility. New code should import directly from:
- ledger_sync.core.auth.tokens
- ledger_sync.core.auth.passwords
- ledger_sync.schemas.auth

"""

import warnings

# Re-export from new locations for backwards compatibility
from ledger_sync.core.auth.passwords import get_password_hash, verify_password
from ledger_sync.core.auth.tokens import (
    create_access_token,
    create_refresh_token,
    create_tokens,
    decode_token,
    verify_token,
)
from ledger_sync.schemas.auth import Token, TokenData, TokenPayload

# Emit deprecation warning when this module is used directly
warnings.warn(
    "ledger_sync.core.auth is deprecated. "
    "Import from ledger_sync.core.auth.tokens, ledger_sync.core.auth.passwords, "
    "or ledger_sync.schemas.auth instead.",
    DeprecationWarning,
    stacklevel=2,
)

__all__ = [
    "Token",
    "TokenData",
    "TokenPayload",
    "create_access_token",
    "create_refresh_token",
    "create_tokens",
    "decode_token",
    "get_password_hash",
    "verify_password",
    "verify_token",
]

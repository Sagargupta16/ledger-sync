"""Signed, one-use OAuth state for the endpoints in ``oauth``.

State is signed and bound to the provider, redirect, and browser-held verifier.
Audit records make consumption atomic across serverless instances without cookies.
"""

import base64
import hashlib
import hmac
import secrets
import time
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from ledger_sync.config.settings import settings
from ledger_sync.core.auth.tokens import legacy_signing_key, purpose_key
from ledger_sync.db.models import AuditLog
from ledger_sync.schemas.auth import OAuthCallbackRequest

_STATE_TTL = 600  # 10 minutes
_STATE_OPERATION = "oauth_login"
_STATE_ENTITY = "oauth_state"


_STATE_KEY_INFO = b"ledger-sync/oauth-state/v1"


def _state_secret() -> bytes:
    """Key used to sign state tokens (an HKDF subkey of the JWT secret)."""
    return purpose_key(_STATE_KEY_INFO)


def _sign_state(payload: str, key: bytes | None = None) -> str:
    """Return the base64url HMAC-SHA256 of a state payload."""
    digest = hmac.new(key or _state_secret(), payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def _state_signature_matches(signature: str, signed: str) -> bool:
    """Accept the subkey, then the raw secret that signed pre-subkey attempts."""
    return any(
        hmac.compare_digest(signature, _sign_state(signed, key))
        for key in (_state_secret(), legacy_signing_key())
    )


def _generate_state(provider: str, code_challenge: str, session: Session) -> str:
    """Record a short-lived initiation and sign its browser/provider binding."""
    now = int(time.time())
    cutoff = datetime.fromtimestamp(now - _STATE_TTL, UTC).replace(tzinfo=None)
    session.execute(
        delete(AuditLog).where(
            AuditLog.operation == _STATE_OPERATION,
            AuditLog.entity_type == _STATE_ENTITY,
            AuditLog.user_id.is_(None),
            AuditLog.created_at <= cutoff,
        )
    )
    nonce = secrets.token_urlsafe(24)
    attempt = AuditLog(
        operation=_STATE_OPERATION,
        entity_type=_STATE_ENTITY,
        entity_id=nonce,
        action="pending",
        created_at=datetime.fromtimestamp(now, UTC).replace(tzinfo=None),
    )
    session.add(attempt)
    session.flush()
    payload = f"{attempt.id}.{nonce}.{provider}.{code_challenge}.{now + _STATE_TTL}"
    signature = _sign_state(f"{payload}.{_get_redirect_uri(provider)}")
    session.commit()
    return f"{payload}.{signature}"


def _validate_state(body: OAuthCallbackRequest, provider: str, session: Session) -> None:
    """Validate browser proof and consume this attempt before any provider call."""
    try:
        attempt_id, nonce, state_provider, challenge, expiry, signature = body.state.split(".")
        record_id = int(attempt_id)
        expires_at = int(expiry)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid sign-in attempt. Please start sign-in again.",
        ) from None

    payload = body.state.rsplit(".", 1)[0]
    expected_challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(body.code_verifier.encode("ascii")).digest())
        .decode()
        .rstrip("=")
    )
    if (
        state_provider != provider
        or not _state_signature_matches(signature, f"{payload}.{_get_redirect_uri(provider)}")
        or not hmac.compare_digest(challenge, expected_challenge)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sign-in does not match this browser or provider. Please start again.",
        )
    if int(time.time()) >= expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This sign-in attempt has expired. Please start sign-in again.",
        )

    consumed_id = session.execute(
        update(AuditLog)
        .where(
            AuditLog.id == record_id,
            AuditLog.operation == _STATE_OPERATION,
            AuditLog.entity_type == _STATE_ENTITY,
            AuditLog.user_id.is_(None),
            AuditLog.entity_id == nonce,
            AuditLog.action == "pending",
        )
        .values(action="consumed")
        .returning(AuditLog.id)
    ).scalar_one_or_none()
    if consumed_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This sign-in attempt was already used. Please start sign-in again.",
        )
    # Commit independently of token exchange so failures cannot resurrect state.
    session.commit()


def _get_redirect_uri(provider: str) -> str:
    """Build the OAuth redirect URI that points to the frontend callback page."""
    return f"{settings.frontend_url.rstrip('/')}/auth/callback/{provider}"

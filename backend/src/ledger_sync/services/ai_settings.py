"""AI settings persistence and credential rotation without analytics invalidation."""

from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.refresh import lock_analytics_user
from ledger_sync.core.encryption import DecryptionError, decrypt_api_key, encrypt_api_key
from ledger_sync.db._models.ai_settings import UserAISettings

LEGACY_BEDROCK_PLACEHOLDER = "bedrock-uses-aws-credentials"


def get_ai_settings(session: Session, user_id: int) -> UserAISettings | None:
    """Read configuration without creating defaults or acquiring a write lock."""
    return session.scalar(select(UserAISettings).where(UserAISettings.user_id == user_id))


def get_or_create_ai_settings(
    session: Session, user_id: int, *, for_update: bool = False, commit: bool = True
) -> UserAISettings:
    """Create defaults under the existing user lock, rechecking after acquiring it.

    Mutation callers request the lock before reading and use ``commit=False``
    to retain one transaction. Ordinary reads lock only when defaults are absent.
    This does not change the analytics generation or load ordinary preferences.
    """
    if for_update:
        lock_analytics_user(session, user_id)
    ai_settings = get_ai_settings(session, user_id)
    if ai_settings is not None:
        return ai_settings
    if not for_update:
        lock_analytics_user(session, user_id)
        ai_settings = get_ai_settings(session, user_id)
    if ai_settings is None:
        ai_settings = UserAISettings(user_id=user_id)
        session.add(ai_settings)
        session.flush()
        if commit:
            session.commit()
            session.refresh(ai_settings)
    return ai_settings


def has_personal_ai_key(ai_settings: UserAISettings) -> bool:
    """Inspect stored configuration without exposing or deleting the ciphertext."""
    if not ai_settings.ai_api_key_encrypted:
        return False
    try:
        value, _ = decrypt_api_key(ai_settings.ai_api_key_encrypted)
    except DecryptionError:
        return False
    return bool(value.strip()) and value.strip() != LEGACY_BEDROCK_PLACEHOLDER


def rewrap_stored_ai_key(session: Session, ai_settings: UserAISettings, plaintext: str) -> None:
    """Upgrade ciphertext only if a concurrent request has not replaced/deleted it."""
    previous = ai_settings.ai_api_key_encrypted
    session.execute(
        update(UserAISettings)
        .where(
            UserAISettings.user_id == ai_settings.user_id,
            UserAISettings.ai_api_key_encrypted == previous,
        )
        .values(ai_api_key_encrypted=encrypt_api_key(plaintext))
        .execution_options(synchronize_session=False)
    )
    session.commit()

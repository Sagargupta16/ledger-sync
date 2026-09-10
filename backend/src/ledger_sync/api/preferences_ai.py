"""AI-config endpoints (PUT/GET/PATCH/DELETE under /api/preferences/ai-config).

Mounted into the main preferences router via include_router.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal, Self

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import update
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.preferences_helpers import _get_or_create_preferences
from ledger_sync.core.encryption import DecryptionError, decrypt_api_key, encrypt_api_key
from ledger_sync.db.models import UserPreferences

router = APIRouter()
LEGACY_BEDROCK_PLACEHOLDER = "bedrock-uses-aws-credentials"


class AIConfigUpdate(BaseModel):
    """AI assistant configuration."""

    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    provider: Literal["openai", "anthropic", "bedrock"]
    model: str = Field(min_length=1, max_length=100, description="Model ID")
    api_key: str | None = Field(
        default=None,
        min_length=1,
        max_length=16_384,
        description="New key; omit to preserve the same provider's stored personal key",
    )
    region: str | None = Field(default=None, min_length=1, max_length=20, pattern=r"^[a-z0-9-]+$")

    @field_validator("api_key")
    @classmethod
    def reject_placeholder(cls, value: str | None) -> str | None:
        if value == LEGACY_BEDROCK_PLACEHOLDER:
            raise ValueError("A legacy placeholder is not an API key; select App Bedrock mode")
        return value

    @model_validator(mode="after")
    def validate_model_storage_length(self) -> Self:
        if self.provider == "bedrock" and self.region and len(f"{self.model}|{self.region}") > 100:
            raise ValueError("Bedrock model and region must fit within 100 characters")
        return self


class AIConfigResponse(BaseModel):
    """AI config response (never includes raw key)."""

    # "app_bedrock" = shared server key, rate-limited / "byok" = user's own key
    mode: str = "app_bedrock"
    provider: str | None = None
    model: str | None = None
    # A decryptable, nonempty personal key exists; this is not provider validation.
    has_key: bool = False
    funding_source: Literal["app", "personal"] | None = None
    region: str | None = None
    # Nullable token budgets (nullable = no limit).
    daily_token_limit: int | None = None
    monthly_token_limit: int | None = None


class AIModeUpdate(BaseModel):
    """Patch payload for switching between app_bedrock and byok."""

    model_config = ConfigDict(extra="forbid", strict=True)

    mode: Literal["app_bedrock", "byok"]


class AILimitsUpdate(BaseModel):
    """Patch-style update for per-user AI token limits.

    Both fields nullable. Pass `null` to clear a previously-set limit.
    Missing fields keep the current value.
    """

    model_config = ConfigDict(extra="forbid", strict=True)

    daily_token_limit: int | None = Field(default=None, ge=0, le=10_000_000)
    monthly_token_limit: int | None = Field(default=None, ge=0, le=100_000_000)
    clear_daily: bool = False
    clear_monthly: bool = False


def has_personal_ai_key(prefs: UserPreferences) -> bool:
    """Inspect stored configuration without exposing or deleting the ciphertext."""
    if not prefs.ai_api_key_encrypted:
        return False
    try:
        value, _ = decrypt_api_key(prefs.ai_api_key_encrypted)
    except DecryptionError:
        return False
    return bool(value.strip()) and value.strip() != LEGACY_BEDROCK_PLACEHOLDER


def _config_response(prefs: UserPreferences) -> AIConfigResponse:
    model = prefs.ai_model
    region = None
    if model and "|" in model:
        model, region = model.rsplit("|", 1)
    has_key = has_personal_ai_key(prefs)
    funding_source: Literal["app", "personal"] | None = None
    if prefs.ai_mode == "app_bedrock":
        funding_source = "app"
    elif has_key:
        funding_source = "personal"
    return AIConfigResponse(
        mode=prefs.ai_mode,
        provider=prefs.ai_provider,
        model=model,
        has_key=has_key,
        funding_source=funding_source,
        region=region,
        daily_token_limit=prefs.ai_daily_token_limit,
        monthly_token_limit=prefs.ai_monthly_token_limit,
    )


@router.put(
    "/ai-config",
    responses={
        400: {"description": "A personal API key is required for this provider"},
        409: {"description": "The stored provider or key changed during the update"},
    },
)
def update_ai_config(
    current_user: CurrentUser,
    config: AIConfigUpdate,
    session: DatabaseSession,
) -> AIConfigResponse:
    """Update model settings, preserving the same provider's key unless replaced."""
    prefs = _get_or_create_preferences(session, current_user)
    if config.api_key is None and (
        prefs.ai_provider != config.provider or not has_personal_ai_key(prefs)
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Enter an API key when configuring a new provider. "
                "Select App Bedrock mode to use the shared service without a personal key."
            ),
        )
    model = config.model
    if config.region and config.provider == "bedrock":
        model = f"{config.model}|{config.region}"
    stored_key = (
        encrypt_api_key(config.api_key)
        if config.api_key is not None
        else prefs.ai_api_key_encrypted
    )
    statement = update(UserPreferences).where(UserPreferences.id == prefs.id)
    if config.api_key is None:
        # A stale model-only save must not restore a key/provider another request changed.
        statement = statement.where(
            UserPreferences.ai_provider == config.provider,
            UserPreferences.ai_api_key_encrypted == stored_key,
        )
    updated_id = session.execute(
        statement.values(
            ai_provider=config.provider,
            ai_model=model,
            ai_api_key_encrypted=stored_key,
            ai_mode="byok",
            updated_at=datetime.now(UTC),
        )
        .returning(UserPreferences.id)
        .execution_options(synchronize_session=False)
    ).scalar_one_or_none()
    if updated_id is None:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="The stored provider or key changed. Reload AI settings before saving.",
        )
    session.commit()
    session.refresh(prefs)
    return _config_response(prefs)


@router.get("/ai-config")
def get_ai_config(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> AIConfigResponse:
    """Get AI config (without the raw key)."""
    prefs = _get_or_create_preferences(session, current_user)
    return _config_response(prefs)


@router.patch("/ai-config/mode")
def update_ai_mode(
    current_user: CurrentUser,
    update: AIModeUpdate,
    session: DatabaseSession,
) -> AIConfigResponse:
    """Switch between app_bedrock (shared server key) and byok.

    Switching to app_bedrock doesn't delete the stored BYOK key, so users
    can flip back. We only toggle the mode flag.
    """
    prefs = _get_or_create_preferences(session, current_user)
    prefs.ai_mode = update.mode
    prefs.updated_at = datetime.now(UTC)
    session.commit()

    return _config_response(prefs)


@router.patch("/ai-config/limits")
def update_ai_limits(
    current_user: CurrentUser,
    update: AILimitsUpdate,
    session: DatabaseSession,
) -> AIConfigResponse:
    """Update per-user daily/monthly token limits.

    Pass `clear_daily`/`clear_monthly` to null out a previously-set limit.
    Otherwise only provided fields are updated.
    """
    prefs = _get_or_create_preferences(session, current_user)
    if update.clear_daily:
        prefs.ai_daily_token_limit = None
    elif "daily_token_limit" in update.model_fields_set:
        prefs.ai_daily_token_limit = update.daily_token_limit
    if update.clear_monthly:
        prefs.ai_monthly_token_limit = None
    elif "monthly_token_limit" in update.model_fields_set:
        prefs.ai_monthly_token_limit = update.monthly_token_limit
    prefs.updated_at = datetime.now(UTC)
    session.commit()

    return _config_response(prefs)


@router.get(
    "/ai-config/key",
    responses={
        404: {"description": "No AI key configured"},
        400: {"description": "Failed to decrypt the stored API key"},
    },
)
def get_ai_key(
    current_user: CurrentUser,
    session: DatabaseSession,
    response: Response,
) -> dict[str, str]:
    """Decrypt and return the API key for frontend LLM calls.

    Sets strict no-store cache headers so the decrypted key never lands in
    intermediary proxy caches, browser disk cache, or service-worker storage.
    """
    prefs = _get_or_create_preferences(session, current_user)
    if not prefs.ai_api_key_encrypted:
        raise HTTPException(status_code=404, detail="No AI key configured")
    try:
        decrypted, needs_reencrypt = decrypt_api_key(prefs.ai_api_key_encrypted)
    except DecryptionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not decrypted.strip() or decrypted.strip() == LEGACY_BEDROCK_PLACEHOLDER:
        raise HTTPException(
            status_code=400,
            detail="No personal API key is configured; enter a key or select App Bedrock mode",
        )
    if needs_reencrypt:
        rewrap_stored_ai_key(session, prefs, decrypted)

    response.headers["Cache-Control"] = "no-store, no-cache, private, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return {"api_key": decrypted}


def rewrap_stored_ai_key(session: Session, prefs: UserPreferences, plaintext: str) -> None:
    """Upgrade a ciphertext without overwriting a concurrently replaced/deleted key."""
    previous = prefs.ai_api_key_encrypted
    session.execute(
        update(UserPreferences)
        .where(
            UserPreferences.id == prefs.id,
            UserPreferences.ai_api_key_encrypted == previous,
        )
        .values(ai_api_key_encrypted=encrypt_api_key(plaintext))
        .execution_options(synchronize_session=False)
    )
    session.commit()


@router.delete("/ai-config")
def delete_ai_config(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, str]:
    """Remove AI configuration and encrypted key."""
    prefs = _get_or_create_preferences(session, current_user)
    prefs.ai_provider = None
    prefs.ai_model = None
    prefs.ai_api_key_encrypted = None
    prefs.updated_at = datetime.now(UTC)
    session.commit()
    return {"status": "deleted"}

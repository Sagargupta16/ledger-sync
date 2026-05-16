"""AI-config endpoints (PUT/GET/PATCH/DELETE under /api/preferences/ai-config).

Mounted into the main preferences router via include_router.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.preferences_helpers import _get_or_create_preferences
from ledger_sync.core.encryption import DecryptionError, decrypt_api_key, encrypt_api_key

router = APIRouter()


class AIConfigUpdate(BaseModel):
    """AI assistant configuration."""

    provider: str = Field(pattern=r"^(openai|anthropic|bedrock)$", description="LLM provider")
    model: str = Field(min_length=1, max_length=100, description="Model ID")
    api_key: str = Field(min_length=1, description="Provider API key (will be encrypted)")
    region: str | None = Field(default=None, max_length=20, description="AWS region for Bedrock")


class AIConfigResponse(BaseModel):
    """AI config response (never includes raw key)."""

    # "app_bedrock" = shared server key, rate-limited / "byok" = user's own key
    mode: str = "app_bedrock"
    provider: str | None = None
    model: str | None = None
    has_key: bool = False
    region: str | None = None
    # Nullable token budgets (nullable = no limit).
    daily_token_limit: int | None = None
    monthly_token_limit: int | None = None


class AIModeUpdate(BaseModel):
    """Patch payload for switching between app_bedrock and byok."""

    mode: str = Field(pattern=r"^(app_bedrock|byok)$")


class AILimitsUpdate(BaseModel):
    """Patch-style update for per-user AI token limits.

    Both fields nullable. Pass `null` to clear a previously-set limit.
    Missing fields keep the current value.
    """

    daily_token_limit: int | None = Field(default=None, ge=0, le=10_000_000)
    monthly_token_limit: int | None = Field(default=None, ge=0, le=100_000_000)
    clear_daily: bool = False
    clear_monthly: bool = False


@router.put("/ai-config")
def update_ai_config(
    current_user: CurrentUser,
    config: AIConfigUpdate,
    session: DatabaseSession,
) -> AIConfigResponse:
    """Store AI provider configuration with encrypted API key."""
    prefs = _get_or_create_preferences(session, current_user)
    prefs.ai_provider = config.provider
    prefs.ai_model = config.model
    if config.region and config.provider == "bedrock":
        prefs.ai_model = f"{config.model}|{config.region}"
    prefs.ai_api_key_encrypted = encrypt_api_key(config.api_key)
    # Saving a provider-specific key implies BYOK intent.
    prefs.ai_mode = "byok"
    prefs.updated_at = datetime.now(UTC)
    session.commit()
    return AIConfigResponse(
        mode=prefs.ai_mode,
        provider=prefs.ai_provider,
        model=config.model,
        has_key=True,
        region=config.region,
        daily_token_limit=prefs.ai_daily_token_limit,
        monthly_token_limit=prefs.ai_monthly_token_limit,
    )


@router.get("/ai-config")
def get_ai_config(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> AIConfigResponse:
    """Get AI config (without the raw key)."""
    prefs = _get_or_create_preferences(session, current_user)
    model = prefs.ai_model
    region = None
    if model and "|" in model:
        model, region = model.rsplit("|", 1)
    return AIConfigResponse(
        mode=prefs.ai_mode,
        provider=prefs.ai_provider,
        model=model,
        has_key=prefs.ai_api_key_encrypted is not None,
        region=region,
        daily_token_limit=prefs.ai_daily_token_limit,
        monthly_token_limit=prefs.ai_monthly_token_limit,
    )


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

    model = prefs.ai_model
    region: str | None = None
    if model and "|" in model:
        model, region = model.rsplit("|", 1)
    return AIConfigResponse(
        mode=prefs.ai_mode,
        provider=prefs.ai_provider,
        model=model,
        has_key=prefs.ai_api_key_encrypted is not None,
        region=region,
        daily_token_limit=prefs.ai_daily_token_limit,
        monthly_token_limit=prefs.ai_monthly_token_limit,
    )


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
    elif update.daily_token_limit is not None:
        prefs.ai_daily_token_limit = update.daily_token_limit
    if update.clear_monthly:
        prefs.ai_monthly_token_limit = None
    elif update.monthly_token_limit is not None:
        prefs.ai_monthly_token_limit = update.monthly_token_limit
    prefs.updated_at = datetime.now(UTC)
    session.commit()

    model = prefs.ai_model
    region: str | None = None
    if model and "|" in model:
        model, region = model.rsplit("|", 1)
    return AIConfigResponse(
        mode=prefs.ai_mode,
        provider=prefs.ai_provider,
        model=model,
        has_key=prefs.ai_api_key_encrypted is not None,
        region=region,
        daily_token_limit=prefs.ai_daily_token_limit,
        monthly_token_limit=prefs.ai_monthly_token_limit,
    )


@router.get("/ai-config/key")
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
        decrypted = decrypt_api_key(prefs.ai_api_key_encrypted)
    except DecryptionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    response.headers["Cache-Control"] = "no-store, no-cache, private, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return {"api_key": decrypted}


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

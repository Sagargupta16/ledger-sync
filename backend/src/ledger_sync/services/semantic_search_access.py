"""Who pays for a semantic-search embedding call, and its usage accounting.

Funding follows the chat proxy: App Bedrock mode spends the server's
credentials, BYOK Bedrock spends the user's own key, and a BYOK OpenAI or
Anthropic user gets no shared fallback. Usage is reserved in ``ai_usage_log``
before a call and settled after it, under the provider ``bedrock-embed``: it
counts toward the user's daily and monthly token budgets and the usage
rollups, but not toward the shared chat message cap (which counts ``bedrock``
rows only). App-funded embeddings have their own daily token cap instead.

The client and usage-lock helpers are borrowed from the chat proxy
(``api.ai_chat_bedrock`` and ``api.ai_usage``). This is the one module of the
feature that imports their underscore-private names, so making them public is
a change to the imports below and nothing else.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ledger_sync.api.ai_chat_bedrock import (
    _build_bedrock_config,
    _check_server_credential_path,
    _create_bedrock_client,
    _resolve_user_bearer,
)
from ledger_sync.api.ai_usage import _lock_usage, _start_of_day, check_token_limits, release_usage
from ledger_sync.config.embedding_settings import embedding_settings
from ledger_sync.config.settings import settings
from ledger_sync.core.embeddings import TITAN_V2_MODEL_ID, BedrockRuntime, usd_cost
from ledger_sync.db.models import AIUsageLog
from ledger_sync.schemas.semantic_search import UnavailableReason
from ledger_sync.services.ai_settings import get_ai_settings, has_personal_ai_key

EMBED_PROVIDER = "bedrock-embed"
# Below the chat's 8 s: a batch must finish inside one serverless request.
_READ_TIMEOUT_SECONDS = 4

_MESSAGES: dict[UnavailableReason, str] = {
    "server_not_configured": (
        "Smart search needs Amazon Bedrock on the server. Set LEDGER_SYNC_BEDROCK_API_KEY "
        "(or AWS credentials) in the backend environment, or save a personal Bedrock key "
        "in Settings > AI Assistant."
    ),
    "provider_not_bedrock": (
        "Smart search runs on Amazon Bedrock. In Settings > AI Assistant, choose App "
        "Bedrock or save a personal Bedrock key."
    ),
    "personal_key_missing": (
        "Your AI mode uses a personal Bedrock key, but none is saved. Add it in "
        "Settings > AI Assistant or choose App Bedrock."
    ),
}


@dataclass(frozen=True, slots=True)
class EmbeddingAccess:
    region: str
    funding: Literal["app", "personal"] | None = None
    reason: UnavailableReason | None = None

    @property
    def message(self) -> str | None:
        return _MESSAGES[self.reason] if self.reason else None


def embedding_access(session: Session, user_id: int) -> EmbeddingAccess:
    """Funding and region for this user's calls; never raises, never spends."""
    default_region = embedding_settings.embedding_region or settings.ai_default_bedrock_region
    ai_settings = get_ai_settings(session, user_id)
    if ai_settings is None or ai_settings.ai_mode != "byok":
        try:
            _check_server_credential_path()
        except HTTPException:
            return EmbeddingAccess(default_region, reason="server_not_configured")
        return EmbeddingAccess(default_region, funding="app")
    if ai_settings.ai_provider != "bedrock":
        return EmbeddingAccess(default_region, reason="provider_not_bedrock")
    if not has_personal_ai_key(ai_settings):
        return EmbeddingAccess(default_region, reason="personal_key_missing")
    # A personal key works in the region saved with it ("model|region").
    saved = ai_settings.ai_model or ""
    region = saved.rsplit("|", 1)[1] if "|" in saved else default_region
    return EmbeddingAccess(region or default_region, funding="personal")


def open_client(session: Session, user_id: int) -> tuple[EmbeddingAccess, BedrockRuntime]:
    """Resolve funding and build the bedrock-runtime client, or raise 400/502/503."""
    access = embedding_access(session, user_id)
    if access.reason is not None:
        status = 503 if access.reason == "server_not_configured" else 400
        raise HTTPException(status_code=status, detail=access.message)
    bearer = None
    if access.funding == "personal":
        ai_settings = get_ai_settings(session, user_id)
        bearer = _resolve_user_bearer(ai_settings, session) if ai_settings else None
        if bearer is None:
            raise HTTPException(status_code=400, detail=_MESSAGES["personal_key_missing"])
    from botocore.config import Config  # type: ignore[import-untyped]

    config = _build_bedrock_config().merge(Config(read_timeout=_READ_TIMEOUT_SECONDS))
    try:
        return access, _create_bedrock_client(access.region, config, bearer)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Bedrock client setup failed before any call. Check the key and region.",
        ) from exc


def lock_user_usage(session: Session, user_id: int) -> None:
    """Take the per-user usage lock; it also serializes two tabs indexing at once."""
    _lock_usage(session, user_id)


def app_tokens_today(session: Session, user_id: int) -> int:
    """App-funded embedding tokens completed or reserved since midnight UTC."""
    used = session.scalar(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (AIUsageLog.status == "reserved", AIUsageLog.reserved_tokens),
                        else_=AIUsageLog.input_tokens,
                    )
                ),
                0,
            )
        ).where(
            AIUsageLog.user_id == user_id,
            AIUsageLog.provider == EMBED_PROVIDER,
            AIUsageLog.funding_source == "app",
            AIUsageLog.status.in_(("reserved", "completed")),
            AIUsageLog.timestamp >= _start_of_day(datetime.now(UTC)),
        )
    )
    return int(used or 0)


def _check_app_allowance(
    session: Session, user_id: int, access: EmbeddingAccess, projected_tokens: int
) -> None:
    """429 when this call would push the app-funded daily embedding tokens past the cap."""
    limit = embedding_settings.embedding_daily_token_limit
    if access.funding != "app" or limit <= 0:
        return
    used = app_tokens_today(session, user_id)
    if used + projected_tokens > limit:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Today's smart-search allowance is used up ({used:,} of {limit:,} "
                "tokens). It resets at midnight UTC."
            ),
        )


def reserve_embedding_usage(
    session: Session, user_id: int, access: EmbeddingAccess, projected_tokens: int
) -> int:
    """Commit a reservation before calling Bedrock (429 when a budget is spent)."""
    try:
        lock_user_usage(session, user_id)
        _check_app_allowance(session, user_id, access, projected_tokens)
        check_token_limits(session, user_id, projected_tokens)
        entry = AIUsageLog(
            user_id=user_id,
            provider=EMBED_PROVIDER,
            model=TITAN_V2_MODEL_ID,
            funding_source=access.funding or "app",
            status="reserved",
            reserved_tokens=projected_tokens,
        )
        session.add(entry)
        session.flush()
        reservation_id = entry.id
        session.commit()
        return reservation_id
    except Exception:
        session.rollback()
        raise


def release_embedding_usage(session: Session, user_id: int, reservation_id: int) -> None:
    """Free a reservation for a call known not to have been billed (commits)."""
    release_usage(session, user_id, reservation_id)


def settle_embedding_usage(
    session: Session, user_id: int, reservation_id: int, input_tokens: int
) -> None:
    """Record what Bedrock billed under the user lock; the caller commits."""
    lock_user_usage(session, user_id)
    entry = session.scalar(
        select(AIUsageLog).where(
            AIUsageLog.id == reservation_id,
            AIUsageLog.user_id == user_id,
            AIUsageLog.status == "reserved",
        )
    )
    if entry is None:
        return
    entry.input_tokens = input_tokens
    entry.output_tokens = 0
    entry.cost_usd = usd_cost(input_tokens)
    entry.reserved_tokens = 0
    entry.status = "completed"

"""AI usage logging + rollup endpoints.

Browser-direct calls (OpenAI, Anthropic) report their usage via POST /log
so we have a single source of truth regardless of provider.
Bedrock (server-side proxy) logs directly from ai_chat.py.

GET /usage returns rollups (today, this month, all time) plus current limits.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.config.settings import settings
from ledger_sync.core.ai_pricing import estimate_cost_usd
from ledger_sync.db.models import AIUsageLog, UserPreferences

router = APIRouter(prefix="/api/ai/usage", tags=["ai-usage"])


class UsageLogRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=20)
    model: str = Field(min_length=1, max_length=100)
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    tool_rounds: int = Field(default=1, ge=1, le=20)


def _start_of_day(now: datetime) -> datetime:
    return datetime(now.year, now.month, now.day, tzinfo=UTC)


def _start_of_month(now: datetime) -> datetime:
    return datetime(now.year, now.month, 1, tzinfo=UTC)


def _rollup_since(db: Any, user_id: int, since: datetime) -> dict[str, Any]:
    row = db.execute(
        select(
            func.coalesce(func.sum(AIUsageLog.input_tokens), 0),
            func.coalesce(func.sum(AIUsageLog.output_tokens), 0),
            func.coalesce(func.sum(AIUsageLog.cost_usd), 0.0),
            func.count(),
        ).where(AIUsageLog.user_id == user_id, AIUsageLog.timestamp >= since)
    ).one()
    return {
        "input_tokens": int(row[0]),
        "output_tokens": int(row[1]),
        "total_tokens": int(row[0]) + int(row[1]),
        "cost_usd": float(row[2]),
        "call_count": int(row[3]),
    }


def record_usage(
    db: Any,
    user_id: int,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    tool_rounds: int = 1,
) -> AIUsageLog:
    """Shared writer so ai_chat.py and ai_usage.py produce identical rows."""
    cost = estimate_cost_usd(provider, model, input_tokens, output_tokens)
    entry = AIUsageLog(
        user_id=user_id,
        provider=provider,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        tool_rounds=tool_rounds,
        cost_usd=cost,
    )
    db.add(entry)
    db.commit()
    return entry


def count_app_messages_today(db: Any, user_id: int) -> int:
    """How many chat messages this user has sent via app_bedrock today.

    One user-initiated chat send can spawn multiple backend rounds (tool
    calls), but we only want to count the outer message against the cap.
    Rows recorded with tool_rounds >= 1 in "app_bedrock" mode form a
    single 'message' when they're the FIRST round of that conversation --
    but distinguishing that server-side is fragile, so we just count
    rows where provider == 'bedrock' and timestamp is today. A chatty
    6-round exchange therefore costs 6 of the daily 10 messages -- that's
    a reasonable incentive to ask concise questions. Users who need more
    should switch to BYOK.
    """
    since = _start_of_day(datetime.now(UTC))
    return int(
        db.execute(
            select(func.count())
            .select_from(AIUsageLog)
            .where(
                AIUsageLog.user_id == user_id,
                AIUsageLog.provider == "bedrock",
                AIUsageLog.timestamp >= since,
            )
        ).scalar_one()
    )


def check_app_message_limit(db: Any, user_id: int) -> None:
    """Raise 429 if an app_bedrock user has hit the app-wide daily message
    cap. Only applies to users on the shared Bedrock token; BYOK is not
    affected."""
    limit = settings.ai_daily_message_limit
    if limit <= 0:
        return  # 0/negative disables the cap entirely
    used = count_app_messages_today(db, user_id)
    if used >= limit:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily AI message limit reached ({used}/{limit}). "
                "Resets midnight UTC. Switch to Bring-Your-Own-Key in "
                "Settings > AI Assistant for unlimited usage with your own key."
            ),
        )


def check_token_limits(
    db: Any,
    user_id: int,
    projected_tokens: int = 0,
) -> None:
    """Raise HTTPException(429) if today's or this month's usage + projected
    would exceed the user's configured limits.

    `projected_tokens` is optional; pass the expected cost of the pending call
    to reject it before it starts. Pass 0 after the call to block the *next*
    one if we're already over.
    """
    prefs = db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    ).scalar_one_or_none()
    if not prefs:
        return
    now = datetime.now(UTC)
    daily = prefs.ai_daily_token_limit
    monthly = prefs.ai_monthly_token_limit
    if daily is None and monthly is None:
        return

    if daily is not None:
        today = _rollup_since(db, user_id, _start_of_day(now))
        if today["total_tokens"] + projected_tokens > daily:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Daily AI token limit reached ({today['total_tokens']}/{daily}). "
                    "Adjust the limit in Settings > AI Assistant or wait until midnight UTC."
                ),
            )
    if monthly is not None:
        mtd = _rollup_since(db, user_id, _start_of_month(now))
        if mtd["total_tokens"] + projected_tokens > monthly:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Monthly AI token limit reached ({mtd['total_tokens']}/{monthly}). "
                    "Adjust the limit in Settings > AI Assistant."
                ),
            )


@router.post("/log")
def log_usage(
    current_user: CurrentUser,
    request: UsageLogRequest,
    session: DatabaseSession,
) -> dict[str, Any]:
    """Record a single LLM round-trip. Used by browser-direct providers
    (OpenAI, Anthropic) which never touch our backend otherwise."""
    entry = record_usage(
        session,
        current_user.id,
        request.provider,
        request.model,
        request.input_tokens,
        request.output_tokens,
        request.tool_rounds,
    )
    return {"id": entry.id, "cost_usd": entry.cost_usd}


@router.get("")
def get_usage(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    """Return today / month / all-time usage + current configured limits."""
    now = datetime.now(UTC)
    prefs = session.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    ).scalar_one_or_none()

    today = _rollup_since(session, current_user.id, _start_of_day(now))
    month = _rollup_since(session, current_user.id, _start_of_month(now))
    # All-time: simpler to reuse _rollup_since with a zero-ish epoch
    all_time = _rollup_since(session, current_user.id, datetime(1970, 1, 1, tzinfo=UTC))

    # App-mode message cap (only meaningful when the user is on app_bedrock)
    mode = prefs.ai_mode if prefs else "app_bedrock"
    messages_today = (
        count_app_messages_today(session, current_user.id) if mode == "app_bedrock" else 0
    )

    return {
        "mode": mode,
        "today": today,
        "month_to_date": month,
        "all_time": all_time,
        "limits": {
            "daily": prefs.ai_daily_token_limit if prefs else None,
            "monthly": prefs.ai_monthly_token_limit if prefs else None,
            # App-wide message cap surfaced here so the client can render
            # "X / 10 messages today" without knowing the setting.
            "app_daily_messages": settings.ai_daily_message_limit,
        },
        "messages_today": messages_today,
        "as_of": now.isoformat(),
        "day_start": _start_of_day(now).isoformat(),
        "month_start": _start_of_month(now).isoformat(),
        "next_reset_utc": (_start_of_day(now) + timedelta(days=1)).isoformat(),
    }

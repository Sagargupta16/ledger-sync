"""AI usage logging + rollup endpoints.

Browser-direct calls (OpenAI, Anthropic) report their usage via POST /log
so we have a single source of truth regardless of provider.
Bedrock (server-side proxy) logs directly from ai_chat.py.

GET /usage returns rollups (today, this month, all time) plus current limits.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import case, func, select, update
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.config.settings import settings
from ledger_sync.core.ai_pricing import estimate_cost_usd
from ledger_sync.db.models import AIUsageLog, User, UserPreferences

router = APIRouter(prefix="/api/ai/usage", tags=["ai-usage"])


class UsageLogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    # Bedrock counters and funding are recorded only by the server.
    provider: Literal["openai", "anthropic"]
    model: str = Field(min_length=1, max_length=100)
    input_tokens: int = Field(ge=0, le=10_000_000)
    output_tokens: int = Field(ge=0, le=1_000_000)
    tool_rounds: int = Field(default=1, ge=1, le=20)


def _start_of_day(now: datetime) -> datetime:
    return datetime(now.year, now.month, now.day, tzinfo=UTC)


def _start_of_month(now: datetime) -> datetime:
    return datetime(now.year, now.month, 1, tzinfo=UTC)


def _rollup_since(db: Session, user_id: int, since: datetime) -> dict[str, Any]:
    row = db.execute(
        select(
            func.coalesce(func.sum(AIUsageLog.input_tokens), 0),
            func.coalesce(func.sum(AIUsageLog.output_tokens), 0),
            func.coalesce(func.sum(AIUsageLog.cost_usd), 0.0),
            func.count(),
        ).where(
            AIUsageLog.user_id == user_id,
            AIUsageLog.timestamp >= since,
            AIUsageLog.status == "completed",
        )
    ).one()
    pending = db.execute(
        select(func.coalesce(func.sum(AIUsageLog.reserved_tokens), 0), func.count()).where(
            AIUsageLog.user_id == user_id,
            AIUsageLog.timestamp >= since,
            AIUsageLog.status == "reserved",
        )
    ).one()
    return {
        "input_tokens": int(row[0]),
        "output_tokens": int(row[1]),
        "total_tokens": int(row[0]) + int(row[1]),
        "cost_usd": float(row[2]),
        "call_count": int(row[3]),
        "reserved_tokens": int(pending[0]),
        "pending_call_count": int(pending[1]),
    }


def _lock_usage(db: Session, user_id: int) -> None:
    """Serialize quota changes across workers without holding a network-call lock.

    A no-op UPDATE takes a row lock on PostgreSQL and a write lock on SQLite.
    Every usage writer takes this lock before reading counters. SELECT FOR UPDATE
    alone would silently provide no serialization on SQLite.
    """
    db.execute(
        update(User)
        .where(User.id == user_id)
        .values(id=User.id, updated_at=User.updated_at)
        .execution_options(synchronize_session=False)
    )


def record_usage(
    db: Session,
    user_id: int,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    tool_rounds: int = 1,
    *,
    funding_source: Literal["app", "personal"] = "personal",
) -> AIUsageLog:
    """Record completed usage; browser reports always use personal funding."""
    _lock_usage(db, user_id)
    cost = estimate_cost_usd(provider, model, input_tokens, output_tokens)
    entry = AIUsageLog(
        user_id=user_id,
        provider=provider,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        tool_rounds=tool_rounds,
        cost_usd=cost,
        funding_source=funding_source,
        status="completed",
    )
    db.add(entry)
    db.commit()
    return entry


def count_app_messages_today(db: Session, user_id: int) -> int:
    """Count completed and reserved shared-funded Bedrock rounds today.

    Historical Bedrock rows have unknown funding and count conservatively until
    their UTC day ends. New personal-key calls never consume shared quota.
    """
    since = _start_of_day(datetime.now(UTC))
    return int(
        db.execute(
            select(func.count())
            .select_from(AIUsageLog)
            .where(
                AIUsageLog.user_id == user_id,
                AIUsageLog.provider == "bedrock",
                AIUsageLog.funding_source.in_(("app", "legacy")),
                AIUsageLog.status.in_(("reserved", "completed")),
                AIUsageLog.timestamp >= since,
            )
        ).scalar_one()
    )


def check_app_message_limit(db: Session, user_id: int) -> None:
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
    db: Session,
    user_id: int,
    projected_tokens: int = 0,
) -> None:
    """Check completed usage and outstanding reservations against token budgets.

    The caller must hold the per-user usage lock when reserving a provider call.
    A configured zero budget blocks calls even before any tokens are used.
    """
    limits = db.execute(
        select(UserPreferences.ai_daily_token_limit, UserPreferences.ai_monthly_token_limit).where(
            UserPreferences.user_id == user_id
        )
    ).one_or_none()
    if limits is None:
        return
    now = datetime.now(UTC)
    for period, limit, since in (
        ("Daily", limits[0], _start_of_day(now)),
        ("Monthly", limits[1], _start_of_month(now)),
    ):
        if limit is None:
            continue
        used = int(
            db.execute(
                select(
                    func.coalesce(
                        func.sum(
                            case(
                                (AIUsageLog.status == "reserved", AIUsageLog.reserved_tokens),
                                else_=AIUsageLog.input_tokens + AIUsageLog.output_tokens,
                            )
                        ),
                        0,
                    )
                ).where(
                    AIUsageLog.user_id == user_id,
                    AIUsageLog.timestamp >= since,
                    AIUsageLog.status.in_(("reserved", "completed")),
                )
            ).scalar_one()
        )
        if used >= limit or used + projected_tokens > limit:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"{period} AI token limit reached or insufficient for this request "
                    f"({used}/{limit} used or reserved; {projected_tokens} requested). "
                    "Adjust the limit in Settings > AI Assistant or wait for the UTC reset."
                ),
            )


def reserve_usage(
    db: Session,
    user_id: int,
    model: str,
    projected_tokens: int,
    *,
    funding_source: Literal["app", "personal"],
) -> int:
    """Commit a quota reservation before invoking Bedrock, then release the lock.

    A worker that disappears after invocation leaves a conservative reservation.
    It remains counted for its original daily/monthly windows, so a restart or
    ambiguous provider timeout cannot refund potentially billed work.
    """
    if projected_tokens <= 0:
        raise ValueError("A provider call must reserve a positive token estimate")
    try:
        _lock_usage(db, user_id)
        if funding_source == "app":
            check_app_message_limit(db, user_id)
        check_token_limits(db, user_id, projected_tokens)
        entry = AIUsageLog(
            user_id=user_id,
            provider="bedrock",
            model=model,
            funding_source=funding_source,
            status="reserved",
            reserved_tokens=projected_tokens,
        )
        db.add(entry)
        db.flush()
        reservation_id = entry.id
        db.commit()
        return reservation_id
    except Exception:
        db.rollback()
        raise


def complete_usage(
    db: Session,
    user_id: int,
    reservation_id: int,
    *,
    input_tokens: int,
    output_tokens: int,
) -> None:
    """Settle one reservation with provider-reported counters, exactly once."""
    _lock_usage(db, user_id)
    entry = db.execute(
        select(AIUsageLog).where(
            AIUsageLog.id == reservation_id,
            AIUsageLog.user_id == user_id,
            AIUsageLog.status == "reserved",
        )
    ).scalar_one_or_none()
    if entry is not None:
        entry.input_tokens = input_tokens
        entry.output_tokens = output_tokens
        entry.cost_usd = estimate_cost_usd(entry.provider, entry.model, input_tokens, output_tokens)
        entry.reserved_tokens = 0
        entry.status = "completed"
    db.commit()


def release_usage(db: Session, user_id: int, reservation_id: int) -> None:
    """Release only requests known not to have performed billable inference."""
    _lock_usage(db, user_id)
    db.execute(
        update(AIUsageLog)
        .where(
            AIUsageLog.id == reservation_id,
            AIUsageLog.user_id == user_id,
            AIUsageLog.status == "reserved",
        )
        .values(status="failed", reserved_tokens=0)
    )
    db.commit()


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

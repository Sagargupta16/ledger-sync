"""Unit tests for AI usage logging + rollup + token limits."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Barrier

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ledger_sync.api.ai_usage import (
    check_token_limits,
    complete_usage,
    count_app_messages_today,
    record_usage,
    release_usage,
    reserve_usage,
)
from ledger_sync.api.ai_usage import router as usage_router
from ledger_sync.api.deps import get_current_user
from ledger_sync.config.settings import settings
from ledger_sync.core.ai_pricing import estimate_cost_usd
from ledger_sync.db.base import Base
from ledger_sync.db.models import AIUsageLog, User, UserPreferences
from ledger_sync.db.session import get_session

TEST_BCRYPT_HASH = "$2b$12$dummy_hash_for_testing_purposes"


def _make_app() -> tuple[FastAPI, Session, User]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    user = User(
        email="t@e.com",
        hashed_password=TEST_BCRYPT_HASH,
        full_name="T",
        is_active=True,
        is_verified=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    app = FastAPI()
    app.include_router(usage_router)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: session
    return app, session, user


def test_log_usage_computes_cost_from_pricing_table() -> None:
    app, session, user = _make_app()
    client = TestClient(app)

    resp = client.post(
        "/api/ai/usage/log",
        json={
            "provider": "openai",
            "model": "gpt-4o",
            "input_tokens": 1_000_000,
            "output_tokens": 500_000,
        },
    )
    assert resp.status_code == 200
    body = resp.json()

    # gpt-4o pricing: $2.50 input + $10 output per 1M tokens
    # 1M * 2.50 + 0.5M * 10 = 2.50 + 5.00 = 7.50
    assert body["cost_usd"] == pytest.approx(7.50)

    # Row persisted with the expected fields
    rows = session.query(AIUsageLog).filter_by(user_id=user.id).all()
    assert len(rows) == 1
    assert rows[0].provider == "openai"
    assert rows[0].model == "gpt-4o"
    assert rows[0].input_tokens == 1_000_000
    assert rows[0].output_tokens == 500_000


def test_get_usage_returns_rollups() -> None:
    app, session, user = _make_app()

    # Two entries today + one a month ago
    record_usage(session, user.id, "openai", "gpt-4o", 100_000, 50_000)
    record_usage(session, user.id, "anthropic", "claude-sonnet-4-6", 200_000, 100_000)
    old = AIUsageLog(
        user_id=user.id,
        provider="bedrock",
        model="us.anthropic.claude-haiku-4-5-20251001-v1:0",
        input_tokens=10_000,
        output_tokens=5_000,
        cost_usd=0.05,
        timestamp=datetime.now(UTC) - timedelta(days=40),
    )
    session.add(old)
    session.commit()

    client = TestClient(app)
    body = client.get("/api/ai/usage").json()

    # Today = only the two record_usage entries
    assert body["today"]["call_count"] == 2
    assert body["today"]["input_tokens"] == 300_000
    assert body["today"]["output_tokens"] == 150_000

    # Month-to-date = today (40-day-old row is before month start)
    assert body["month_to_date"]["call_count"] == 2

    # All-time includes the old row
    assert body["all_time"]["call_count"] == 3

    # Per-user limits null by default; app-mode message cap is always
    # surfaced so the client can render "X / N" without knowing the setting.
    assert body["limits"]["daily"] is None
    assert body["limits"]["monthly"] is None
    assert body["limits"]["app_daily_messages"] == 10
    # Default mode is app_bedrock even when no preferences row exists
    assert body["mode"] == "app_bedrock"


def test_get_usage_surfaces_configured_limits() -> None:
    app, session, user = _make_app()
    session.add(UserPreferences(user_id=user.id, ai_daily_token_limit=10_000))
    session.commit()

    client = TestClient(app)
    body = client.get("/api/ai/usage").json()
    assert body["limits"]["daily"] == 10_000
    assert body["limits"]["monthly"] is None


def test_pricing_falls_back_to_conservative_estimate_for_unknown_models() -> None:
    # Unknown provider -- hits _FALLBACK_PER_1M (10/40 per 1M)
    cost = estimate_cost_usd("custom-provider", "mystery-v2", 100_000, 50_000)
    # 0.1M * 10 + 0.05M * 40 = 1.00 + 2.00 = 3.00
    assert cost == pytest.approx(3.00)


def test_pricing_longest_prefix_wins() -> None:
    # `us.anthropic.claude-opus-4` prefix matches before `claude-opus` would
    cost = estimate_cost_usd("bedrock", "us.anthropic.claude-opus-4-7", 1_000_000, 1_000_000)
    # Opus: 15 + 75 = 90 per 1M-in + 1M-out
    assert cost == pytest.approx(90.0)


def test_log_usage_rejects_negative_tokens() -> None:
    app, _s, _u = _make_app()
    client = TestClient(app)
    resp = client.post(
        "/api/ai/usage/log",
        json={
            "provider": "openai",
            "model": "gpt-4o",
            "input_tokens": -1,
            "output_tokens": 100,
        },
    )
    # Pydantic validator rejects negatives (ge=0) -> 422
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "fields",
    [
        {"provider": "bedrock"},
        {"funding_source": "app"},
        {"input_tokens": True},
        {"output_tokens": 1_000_001},
        {"input_tokens": "100"},
    ],
)
def test_browser_usage_cannot_forge_server_funding_or_invalid_counters(fields: dict) -> None:
    app, session, _user = _make_app()
    body = {
        "provider": "openai",
        "model": "gpt-4o",
        "input_tokens": 100,
        "output_tokens": 50,
        **fields,
    }
    response = TestClient(app).post("/api/ai/usage/log", json=body)

    assert response.status_code == 422
    assert session.query(AIUsageLog).count() == 0


@pytest.mark.parametrize("limit_field", ["ai_daily_token_limit", "ai_monthly_token_limit"])
def test_zero_budget_blocks_without_prior_usage(limit_field: str) -> None:
    _app, session, user = _make_app()
    session.add(UserPreferences(user_id=user.id, **{limit_field: 0}))
    session.commit()

    with pytest.raises(HTTPException) as error:
        check_token_limits(session, user.id)

    assert error.value.status_code == 429
    with pytest.raises(HTTPException):
        reserve_usage(session, user.id, "synthetic-model", 1, funding_source="personal")
    assert session.query(AIUsageLog).count() == 0


def test_reservation_blocks_pending_tokens_then_settles_once() -> None:
    app, session, user = _make_app()
    session.add(UserPreferences(user_id=user.id, ai_daily_token_limit=100))
    session.commit()
    user_id = user.id
    previous_updated_at = user.updated_at

    reservation_id = reserve_usage(
        session, user_id, "synthetic-model", 100, funding_source="personal"
    )
    usage = TestClient(app).get("/api/ai/usage").json()["today"]
    assert session.get(User, user_id).updated_at == previous_updated_at
    assert usage["reserved_tokens"] == 100
    assert usage["call_count"] == 0
    with pytest.raises(HTTPException):
        reserve_usage(session, user_id, "synthetic-model", 1, funding_source="personal")

    complete_usage(session, user_id, reservation_id, input_tokens=20, output_tokens=10)
    complete_usage(session, user_id, reservation_id, input_tokens=90, output_tokens=90)
    reserve_usage(session, user_id, "synthetic-model", 70, funding_source="personal")
    with pytest.raises(HTTPException):
        reserve_usage(session, user_id, "synthetic-model", 1, funding_source="personal")

    completed = session.get(AIUsageLog, reservation_id)
    assert completed is not None
    assert completed.input_tokens + completed.output_tokens == 30
    assert completed.status == "completed"
    assert completed.reserved_tokens == 0


def test_personal_bedrock_calls_do_not_consume_shared_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ai_daily_message_limit", 1)
    _app, session, user = _make_app()
    user_id = user.id
    record_usage(session, user_id, "bedrock", "synthetic-model", 20, 10, funding_source="personal")
    reserve_usage(session, user_id, "synthetic-model", 100, funding_source="personal")

    assert count_app_messages_today(session, user_id) == 0
    shared = reserve_usage(session, user_id, "synthetic-model", 100, funding_source="app")
    assert count_app_messages_today(session, user_id) == 1
    with pytest.raises(HTTPException):
        reserve_usage(session, user_id, "synthetic-model", 100, funding_source="app")

    release_usage(session, user_id, shared)
    assert count_app_messages_today(session, user_id) == 0
    reserve_usage(session, user_id, "synthetic-model", 100, funding_source="app")


def test_another_user_cannot_settle_or_release_a_reservation() -> None:
    _app, session, user = _make_app()
    other = User(email="other@example.test", hashed_password=TEST_BCRYPT_HASH, is_active=True)
    session.add(other)
    session.commit()
    reservation_id = reserve_usage(
        session, user.id, "synthetic-model", 100, funding_source="personal"
    )

    complete_usage(session, other.id, reservation_id, input_tokens=1, output_tokens=1)
    release_usage(session, other.id, reservation_id)

    entry = session.get(AIUsageLog, reservation_id)
    assert entry is not None
    assert entry.status == "reserved"
    assert entry.reserved_tokens == 100


@pytest.mark.parametrize("cap", ["messages", "tokens"])
def test_concurrent_reservations_serialize_across_database_connections(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, cap: str
) -> None:
    """Separate engines model workers sharing one database, not a Python lock."""
    database_url = f"sqlite:///{(tmp_path / 'ai-quota.sqlite').as_posix()}"
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(settings, "ai_daily_message_limit", 1 if cap == "messages" else 100)
    with Session(engine) as session:
        user = User(email="quota@example.test", hashed_password=TEST_BCRYPT_HASH, is_active=True)
        session.add(user)
        session.flush()
        user_id = user.id
        session.add(
            UserPreferences(
                user_id=user_id,
                ai_daily_token_limit=100 if cap == "tokens" else None,
            )
        )
        session.commit()

    start = Barrier(6)

    def reserve_from_worker(_index: int) -> int:
        worker_engine = create_engine(database_url, connect_args={"timeout": 10})
        try:
            with Session(worker_engine) as session:
                start.wait(timeout=10)
                try:
                    reserve_usage(session, user_id, "synthetic-model", 100, funding_source="app")
                except HTTPException as exc:
                    return exc.status_code
                return 200
        finally:
            worker_engine.dispose()

    with ThreadPoolExecutor(max_workers=6) as workers:
        results = list(workers.map(reserve_from_worker, range(6)))

    assert results.count(200) == 1
    assert results.count(429) == 5
    with Session(engine) as session:
        assert session.query(AIUsageLog).count() == 1
    engine.dispose()

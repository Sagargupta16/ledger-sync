"""AI settings ownership, defaults, and independence from financial preferences."""

from __future__ import annotations

from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from ledger_sync.api.ai_usage import router as usage_router
from ledger_sync.api.deps import get_current_user
from ledger_sync.api.preferences_ai import router as ai_router
from ledger_sync.core.encryption import encrypt_api_key
from ledger_sync.db._models.ai_settings import UserAISettings
from ledger_sync.db.base import Base
from ledger_sync.db.models import AnalyticsState, User, UserPreferences
from ledger_sync.db.session import get_session
from ledger_sync.services.ai_settings import (
    get_ai_settings,
    get_or_create_ai_settings,
    rewrap_stored_ai_key,
)


@pytest.fixture
def ai_session() -> Generator[Session]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def _user(session: Session, email: str = "ai@example.test") -> User:
    user = User(email=email, hashed_password="", is_active=True, is_verified=True)
    session.add(user)
    session.commit()
    return user


def test_defaults_are_user_owned_without_financial_preferences(ai_session: Session) -> None:
    user = _user(ai_session)
    with patch("ledger_sync.services.ai_settings.lock_analytics_user") as lock:
        assert get_ai_settings(ai_session, user.id) is None
        lock.assert_not_called()

    configured = get_or_create_ai_settings(ai_session, user.id)

    assert configured.user_id == user.id
    assert configured.ai_mode == "app_bedrock"
    assert configured.ai_provider is None
    assert configured.ai_model is None
    assert configured.ai_api_key_encrypted is None
    assert configured.ai_daily_token_limit is None
    assert configured.ai_monthly_token_limit is None
    assert configured.created_at is not None
    assert configured.updated_at is not None
    assert ai_session.query(UserPreferences).count() == 0
    assert ai_session.query(AnalyticsState).count() == 0
    with patch("ledger_sync.services.ai_settings.lock_analytics_user") as lock:
        assert get_or_create_ai_settings(ai_session, user.id) is configured
        lock.assert_not_called()


def test_ordinary_preferences_do_not_map_ai_configuration() -> None:
    assert not any(column.name.startswith("ai_") for column in UserPreferences.__table__.columns)


def test_default_creation_can_join_callers_transaction(ai_session: Session) -> None:
    user = _user(ai_session)
    user_id = user.id
    get_or_create_ai_settings(ai_session, user_id, for_update=True, commit=False)
    ai_session.rollback()
    assert get_ai_settings(ai_session, user_id) is None


def test_default_creation_rechecks_after_user_lock(ai_session: Session) -> None:
    user = _user(ai_session)

    def competing_creation(session: Session, user_id: int) -> None:
        session.add(UserAISettings(user_id=user_id, ai_daily_token_limit=123))
        session.flush()

    with patch(
        "ledger_sync.services.ai_settings.lock_analytics_user", side_effect=competing_creation
    ) as lock:
        configured = get_or_create_ai_settings(ai_session, user.id, commit=False)

    lock.assert_called_once_with(ai_session, user.id)
    assert configured.ai_daily_token_limit == 123
    assert ai_session.query(UserAISettings).count() == 1


def test_missing_user_cannot_get_default_credentials(ai_session: Session) -> None:
    with pytest.raises(ValueError, match="does not exist"):
        get_or_create_ai_settings(ai_session, 999_999)
    assert ai_session.query(UserAISettings).count() == 0


def test_user_id_is_only_primary_key_and_foreign_key_cascades(ai_session: Session) -> None:
    assert list(UserAISettings.__table__.primary_key.columns.keys()) == ["user_id"]
    user = _user(ai_session)
    user_id = user.id
    get_or_create_ai_settings(ai_session, user_id)
    with pytest.raises(IntegrityError):
        ai_session.execute(UserAISettings.__table__.insert().values(user_id=user_id))
    ai_session.rollback()

    ai_session.execute(User.__table__.delete().where(User.id == user_id))
    ai_session.commit()
    assert ai_session.query(UserAISettings).count() == 0


def test_rewrap_only_updates_owner_and_preserves_replacement(ai_session: Session) -> None:
    owner = _user(ai_session)
    other = _user(ai_session, "other-ai@example.test")
    original = encrypt_api_key("synthetic-ai-original")
    replacement = encrypt_api_key("synthetic-ai-replacement")
    ai_session.add_all(
        [
            UserAISettings(user_id=owner.id, ai_api_key_encrypted=original),
            UserAISettings(user_id=other.id, ai_api_key_encrypted=original),
        ]
    )
    ai_session.commit()
    stale = get_ai_settings(ai_session, owner.id)
    assert stale is not None
    ai_session.execute(
        update(UserAISettings)
        .where(UserAISettings.user_id == owner.id)
        .values(ai_api_key_encrypted=replacement)
        .execution_options(synchronize_session=False)
    )

    rewrap_stored_ai_key(ai_session, stale, "synthetic-ai-original")

    owner_settings = get_ai_settings(ai_session, owner.id)
    other_settings = get_ai_settings(ai_session, other.id)
    assert owner_settings is not None and other_settings is not None
    assert owner_settings.ai_api_key_encrypted == replacement
    assert other_settings.ai_api_key_encrypted == original


def test_ai_endpoints_are_isolated_and_do_not_invalidate_analytics(
    ai_session: Session, caplog: pytest.LogCaptureFixture
) -> None:
    owner = _user(ai_session)
    other = _user(ai_session, "other-ai@example.test")
    state = AnalyticsState(user_id=owner.id, preferences_version=17, ledger_version=23)
    ai_session.add(state)
    ai_session.commit()
    current = {"user": owner}
    app = FastAPI()
    app.include_router(ai_router, prefix="/api/preferences")
    app.include_router(usage_router)
    app.dependency_overrides[get_current_user] = lambda: current["user"]
    app.dependency_overrides[get_session] = lambda: ai_session
    statements: list[str] = []

    def capture_sql(_conn, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement)

    event.listen(ai_session.get_bind(), "before_cursor_execute", capture_sql)
    with TestClient(app) as client:
        defaults = client.get("/api/preferences/ai-config")
        assert defaults.status_code == 200
        assert defaults.json() == {
            "mode": "app_bedrock",
            "provider": None,
            "model": None,
            "has_key": False,
            "funding_source": "app",
            "region": None,
            "daily_token_limit": None,
            "monthly_token_limit": None,
        }
        saved = client.put(
            "/api/preferences/ai-config",
            json={
                "provider": "openai",
                "model": "synthetic-model",
                "api_key": "synthetic-personal-ai-key",
            },
        )
        assert saved.status_code == 200
        assert saved.json()["funding_source"] == "personal"
        assert (
            client.patch(
                "/api/preferences/ai-config/limits",
                json={"daily_token_limit": 0, "monthly_token_limit": 500},
            ).status_code
            == 200
        )
        usage = client.get("/api/ai/usage")
        assert usage.json()["limits"]["daily"] == 0
        revealed = client.get("/api/preferences/ai-config/key")
        assert revealed.json() == {"api_key": "synthetic-personal-ai-key"}
        assert "no-store" in revealed.headers["Cache-Control"]

        current["user"] = other
        assert client.get("/api/preferences/ai-config/key").status_code == 404
        assert client.get("/api/ai/usage").json()["limits"]["daily"] is None
        assert client.delete("/api/preferences/ai-config").status_code == 200
        current["user"] = owner
        assert client.get("/api/preferences/ai-config").json()["has_key"] is True
        assert client.delete("/api/preferences/ai-config").json() == {"status": "deleted"}
        cleared = client.get("/api/preferences/ai-config").json()
        assert cleared["has_key"] is False
        assert cleared["provider"] is None
        assert cleared["model"] is None
        assert cleared["mode"] == "byok"
        assert cleared["daily_token_limit"] == 0
        assert cleared["monthly_token_limit"] == 500

    assert not any("user_preferences" in sql for sql in statements)
    assert not any("analytics_state" in sql.lower() for sql in statements)
    assert "synthetic-personal-ai-key" not in caplog.text
    ai_session.refresh(state)
    assert state.preferences_version == 17
    assert state.ledger_version == 23
    assert ai_session.query(UserPreferences).count() == 0


def test_concurrent_default_creation_yields_one_user_row(tmp_path: Path) -> None:
    database_url = f"sqlite:///{(tmp_path / 'ai-settings.sqlite').as_posix()}"
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        user_id = _user(session).id
    start = Barrier(6)

    def create_from_worker(_index: int) -> int:
        with Session(engine) as session:
            start.wait(timeout=10)
            configured = get_or_create_ai_settings(session, user_id)
            return configured.user_id

    with ThreadPoolExecutor(max_workers=6) as workers:
        assert list(workers.map(create_from_worker, range(6))) == [user_id] * 6
    with Session(engine) as session:
        assert session.scalars(select(UserAISettings)).one().ai_mode == "app_bedrock"
    engine.dispose()

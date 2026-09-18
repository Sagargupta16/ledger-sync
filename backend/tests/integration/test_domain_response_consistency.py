"""Preferences responses stay coherent under the user lock after a write commits.

SQLite uses independent connections to a disposable file. Native PostgreSQL is
optional and restricted to a local ledger_sync_test* database, with a fresh
schema per test. No application database or provider credentials are needed.
"""

from __future__ import annotations

import os
import sqlite3
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from ledger_sync.api.preferences import (
    get_preferences,
    reset_preferences,
    update_preferences,
)
from ledger_sync.api.preferences_helpers import (
    UserPreferencesUpdate,
    _apply_preference_updates,
    _model_to_response,
)
from ledger_sync.core.analytics.refresh import lock_analytics_user
from ledger_sync.db.base import Base
from ledger_sync.db.models import RsuVestingRecord, User, UserPreferences
from ledger_sync.services.account_settings import replace_credit_card_limits
from ledger_sync.services.compensation import update_compensation_preferences


@dataclass
class ResponseDatabase:
    engine: sa.Engine
    schema: str | None = None
    user_id: int = 0

    @contextmanager
    def session(self) -> Iterator[Session]:
        with self.engine.connect() as connection:
            if self.schema:
                quoted = connection.dialect.identifier_preparer.quote_schema(self.schema)
                connection.exec_driver_sql(f"SET search_path TO {quoted}")
                connection.commit()
            # Match the application's session factory, including pending reset edits.
            with Session(bind=connection, autoflush=False) as session:
                yield session


@pytest.fixture(params=["sqlite", "postgresql"])
def response_database(request: pytest.FixtureRequest, tmp_path: Path) -> Iterator[ResponseDatabase]:
    schema = None
    if request.param == "postgresql":
        url = os.environ.get("LEDGER_SYNC_TEST_POSTGRES_URL")
        if not url:
            pytest.skip("Set LEDGER_SYNC_TEST_POSTGRES_URL for disposable PostgreSQL verification")
        parsed = sa.make_url(url)
        if parsed.host not in {"localhost", "127.0.0.1", "::1"} or not (
            parsed.database or ""
        ).startswith("ledger_sync_test"):
            pytest.fail("Response consistency tests require a local ledger_sync_test* database")
        if parsed.drivername in {"postgresql", "postgresql+psycopg2"}:
            parsed = parsed.set(drivername="postgresql+psycopg")
        engine = sa.create_engine(parsed, isolation_level="READ COMMITTED")
        schema = f"ledger_sync_response_{uuid4().hex}"
        with engine.begin() as connection:
            connection.execute(sa.schema.CreateSchema(schema))
    else:
        engine = sa.create_engine(
            f"sqlite:///{(tmp_path / 'response-consistency.sqlite').as_posix()}",
            connect_args={"check_same_thread": False, "timeout": 5},
        )
    database = ResponseDatabase(engine, schema)
    try:
        with database.session() as session:
            Base.metadata.create_all(session.connection())
            user = User(email="response@example.test", hashed_password="", is_active=True)
            session.add(user)
            session.flush()
            database.user_id = user.id
            session.add(UserPreferences(user_id=user.id, number_format="international"))
            update_compensation_preferences(
                session,
                user.id,
                {
                    "salary_structure": {"2026-27": {"base_salary_annual": "100000.25"}},
                    "rsu_grants": [
                        {
                            "id": "synthetic-grant",
                            "stock_name": "Example",
                            "stock_price": "10",
                            "vestings": [{"date": "2026-09-01", "quantity": 1}],
                        }
                    ],
                },
            )
            replace_credit_card_limits(session, user.id, {"Example card": "1234.56"})
            session.commit()
        yield database
    finally:
        if schema:
            with engine.begin() as connection:
                connection.exec_driver_sql("SET search_path TO public")
                connection.execute(sa.schema.DropSchema(schema, cascade=True))
        engine.dispose()


def _set_short_lock_timeout(session: Session) -> None:
    if session.get_bind().dialect.name == "postgresql":
        session.execute(sa.text("SET LOCAL lock_timeout = '100ms'"))
    else:
        session.execute(sa.text("PRAGMA busy_timeout=100"))


def _assert_lock_timeout(error: OperationalError, dialect: str) -> None:
    if dialect == "postgresql":
        assert getattr(error.orig, "sqlstate", None) == "55P03"
    else:
        assert getattr(error.orig, "sqlite_errorcode", None) == sqlite3.SQLITE_BUSY


def _assert_writer_blocked(database: ResponseDatabase) -> None:
    with database.session() as writer:
        _set_short_lock_timeout(writer)
        with pytest.raises(OperationalError) as failure:
            lock_analytics_user(writer, database.user_id)
        _assert_lock_timeout(failure.value, database.engine.dialect.name)
        writer.rollback()


@pytest.mark.parametrize("endpoint", ["get", "put", "reset"])
def test_response_reacquires_and_holds_user_lock_after_commit(
    response_database: ResponseDatabase, endpoint: str
) -> None:
    database = response_database
    with database.session() as reader:
        user = reader.get(User, database.user_id)
        assert user is not None
        if endpoint == "get":
            # Missing ordinary preferences force GET's default-creation commit,
            # while existing normalized domains still need one coherent response.
            reader.execute(sa.delete(UserPreferences).where(UserPreferences.user_id == user.id))
            reader.commit()
            response = get_preferences(user, reader)
        elif endpoint == "put":
            response = update_preferences(
                user, UserPreferencesUpdate(number_format="indian"), reader
            )
        else:
            response = reset_preferences(user, reader)

        assert response.number_format == "indian"
        assert response.rsu_grants[0]["vestings"][0]["quantity"] == 1
        assert reader.in_transaction()
        _assert_writer_blocked(database)
        if database.engine.dialect.name == "postgresql":
            # The response lock must allow a second reader, not take FOR UPDATE.
            with database.session() as other_reader:
                _set_short_lock_timeout(other_reader)
                lock_analytics_user(other_reader, database.user_id, read_only=True)
        reader.rollback()

    with database.session() as writer:
        _set_short_lock_timeout(writer)
        lock_analytics_user(writer, database.user_id)


def test_clean_ordinary_preferences_are_refreshed_with_the_response(
    response_database: ResponseDatabase,
) -> None:
    database = response_database
    with database.session() as reader:
        prefs = reader.scalar(
            sa.select(UserPreferences).where(UserPreferences.user_id == database.user_id)
        )
        assert prefs is not None and prefs.number_format == "international"
        assert not reader.is_modified(prefs)
        with database.session() as writer:
            user = writer.get(User, database.user_id)
            assert user is not None
            _apply_preference_updates(
                writer,
                user,
                {
                    "number_format": "indian",
                    "salary_structure": {"2026-27": {"base_salary_annual": "200000.50"}},
                },
            )

        response = _model_to_response(prefs, reader)

        assert response.number_format == "indian"
        assert response.salary_structure["2026-27"]["base_salary_annual"] == "200000.50"
        _assert_writer_blocked(database)


def test_pending_reset_edits_survive_response_assembly_without_commit(
    response_database: ResponseDatabase,
) -> None:
    database = response_database
    with database.session() as reader:
        lock_analytics_user(reader, database.user_id)
        prefs = reader.scalar(
            sa.select(UserPreferences).where(UserPreferences.user_id == database.user_id)
        )
        assert prefs is not None
        prefs.number_format = "indian"
        prefs.savings_goal_percent = 37
        assert reader.is_modified(prefs)

        response = _model_to_response(prefs, reader)

        assert response.number_format == "indian"
        assert response.savings_goal_percent == 37
        assert response.credit_card_limits == {"Example card": 1234.56}
        _assert_writer_blocked(database)
        reader.rollback()

    with database.session() as verify:
        stored = verify.scalar(
            sa.select(UserPreferences).where(UserPreferences.user_id == database.user_id)
        )
        assert stored is not None
        assert stored.number_format == "international"
        assert stored.savings_goal_percent == 20


def test_concurrent_rsu_delete_cannot_split_grants_from_vestings(
    response_database: ResponseDatabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = response_database

    def competing_delete() -> str:
        with database.session() as writer:
            _set_short_lock_timeout(writer)
            user = writer.get(User, database.user_id)
            assert user is not None
            try:
                _apply_preference_updates(writer, user, {"rsu_grants": []})
            except OperationalError as error:
                _assert_lock_timeout(error, database.engine.dialect.name)
                writer.rollback()
                return "blocked"
            return "committed"

    with database.session() as reader, ThreadPoolExecutor(max_workers=1) as workers:
        user = reader.get(User, database.user_id)
        assert user is not None
        prefs = _apply_preference_updates(reader, user, {"number_format": "indian"})
        original_scalars = reader.scalars
        attempted = False

        def interleave(statement: Any, *args: Any, **kwargs: Any) -> Any:
            nonlocal attempted
            if not attempted and any(
                description.get("entity") is RsuVestingRecord
                for description in statement.column_descriptions
            ):
                # The grant list has been consumed. Try the exact writer that
                # formerly removed its events before the next response query.
                attempted = True
                assert workers.submit(competing_delete).result(timeout=5) == "blocked"
            return original_scalars(statement, *args, **kwargs)

        monkeypatch.setattr(reader, "scalars", interleave)
        response = _model_to_response(prefs, reader)

        assert attempted
        assert response.number_format == "indian"
        assert len(response.rsu_grants) == 1
        assert response.rsu_grants[0]["id"] == "synthetic-grant"
        assert response.rsu_grants[0]["vestings"][0]["quantity"] == 1
        reader.rollback()
        assert workers.submit(competing_delete).result(timeout=5) == "committed"

    with database.session() as verify:
        prefs = verify.scalar(
            sa.select(UserPreferences).where(UserPreferences.user_id == database.user_id)
        )
        assert prefs is not None
        response = _model_to_response(prefs, verify)
        assert response.number_format == "indian"
        assert response.rsu_grants == []

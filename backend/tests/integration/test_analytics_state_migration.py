"""The assigned migration is tested independently of concurrent chain edits."""

from importlib import import_module

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_analytics_state_migration_defaults_cascade_and_idempotence():
    migration = import_module("ledger_sync.db.migrations.versions.20260917_1200_analytics_versions")
    assert migration.revision == "analytics_versions_2026"
    assert migration.down_revision == "stable_import_identity_2026"
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users (id) VALUES (1)"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            migration.upgrade()
            connection.execute(text("INSERT INTO analytics_state (user_id) VALUES (1)"))
            state = connection.execute(text("SELECT * FROM analytics_state")).mappings().one()
            assert state["ledger_version"] == 0
            assert state["preferences_version"] == 0
            assert state["algorithm_version"] == 1
            assert state["published_ledger_version"] == -1
            assert state["published_preferences_version"] == -1
            assert state["published_algorithm_version"] == 0
            assert state["full_rebuild_required"] == 1
            assert state["dirty_dates"] == "[]"
            assert state["published_at"] is None
            connection.execute(text("DELETE FROM users WHERE id=1"))
            assert connection.execute(text("SELECT * FROM analytics_state")).first() is None
            migration.downgrade()
            assert not inspect(connection).has_table("analytics_state")
    engine.dispose()

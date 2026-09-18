"""Exercise the AI extraction revision against isolated legacy schema fixtures."""

from __future__ import annotations

import importlib.util
import os
from collections.abc import Generator
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.util import CommandError

from ledger_sync.db._models.ai_settings import UserAISettings
from ledger_sync.db.models import User, UserPreferences

AI_FIELDS = (
    "ai_mode",
    "ai_provider",
    "ai_model",
    "ai_api_key_encrypted",
    "ai_daily_token_limit",
    "ai_monthly_token_limit",
)
COPY_COLUMNS = ("user_id", *AI_FIELDS, "created_at", "updated_at")


@pytest.fixture
def migration() -> ModuleType:
    path = (
        Path(__file__).resolve().parents[2]
        / "src/ledger_sync/db/migrations/versions/20260918_1100_ai_settings.py"
    )
    spec = importlib.util.spec_from_file_location("ai_settings_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(params=["sqlite", "postgresql"])
def legacy_connection(request: pytest.FixtureRequest) -> Generator[sa.Connection]:
    """Only PostgreSQL databases explicitly named ledger_sync_test* on localhost."""
    schema = None
    if request.param == "postgresql":
        url = os.environ.get("LEDGER_SYNC_TEST_POSTGRES_URL")
        if not url:
            pytest.skip("Set LEDGER_SYNC_TEST_POSTGRES_URL for disposable PostgreSQL verification")
        parsed = sa.make_url(url)
        if parsed.host not in {"localhost", "127.0.0.1", "::1"} or not (
            parsed.database or ""
        ).startswith("ledger_sync_test"):
            pytest.fail("AI migration tests require a local ledger_sync_test* database")
        engine = sa.create_engine(parsed)
        schema = f"ledger_sync_ai_settings_{uuid4().hex}"
    else:
        engine = sa.create_engine("sqlite:///:memory:")
    with engine.connect() as connection:
        if schema:
            connection.execute(sa.schema.CreateSchema(schema))
            connection.exec_driver_sql(f'SET search_path TO "{schema}"')
            connection.commit()
        else:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        metadata = sa.MetaData()
        users = sa.Table("users", metadata, sa.Column("id", sa.Integer, primary_key=True))
        sa.Table(
            "user_preferences",
            metadata,
            sa.Column("id", sa.Integer, primary_key=True),
            # Omit legacy ownership constraints to exercise malformed source data.
            sa.Column("user_id", sa.Integer),
            sa.Column("ai_mode", sa.String(16), nullable=False, server_default="app_bedrock"),
            sa.Column("ai_provider", sa.String(20)),
            sa.Column("ai_model", sa.String(100)),
            sa.Column("ai_api_key_encrypted", sa.Text),
            sa.Column("ai_daily_token_limit", sa.Integer),
            sa.Column("ai_monthly_token_limit", sa.Integer),
            sa.Column("created_at", sa.DateTime, nullable=True),
            sa.Column("updated_at", sa.DateTime, nullable=True),
        )
        try:
            metadata.create_all(connection)
            connection.execute(users.insert(), [{"id": value} for value in (10, 20, 30, 40)])
            connection.commit()
            yield connection
        finally:
            connection.rollback()
            if schema:
                connection.exec_driver_sql("SET search_path TO public")
                connection.execute(sa.schema.DropSchema(schema, cascade=True))
                connection.commit()
    engine.dispose()


def test_copy_preserves_ciphertext_limits_and_legacy_columns(
    legacy_connection: sa.Connection, migration: ModuleType
) -> None:
    connection = legacy_connection
    connection.execute(
        sa.text(
            "INSERT INTO user_preferences "
            "(id, user_id, ai_mode, ai_provider, ai_model, ai_api_key_encrypted, "
            "ai_daily_token_limit, ai_monthly_token_limit, created_at, updated_at) "
            "VALUES (:id, :user_id, :mode, :provider, :model, :ciphertext, "
            ":daily, :monthly, :created, :updated)"
        ),
        [
            {
                "id": 501,
                "user_id": 10,
                "mode": "byok",
                "provider": "bedrock",
                "model": "synthetic-model|us-east-1",
                "ciphertext": "ls-byok:v3:synthetic-unreadable-ciphertext==\n",
                "daily": 0,
                "monthly": 100_000_000,
                "created": "2025-01-02 03:04:05.123456",
                "updated": "2026-09-17 10:20:30.654321",
            },
            {
                "id": 502,
                "user_id": 20,
                "mode": "app_bedrock",
                "provider": "openai",
                "model": "old-model",
                "ciphertext": "  opaque-legacy-\u00e9-value  ",
                "daily": None,
                "monthly": None,
                "created": "2024-03-02 01:02:03",
                "updated": "2026-07-17 01:02:03",
            },
        ],
    )
    connection.exec_driver_sql("INSERT INTO user_preferences (id, user_id) VALUES (503, 30)")
    before = connection.execute(sa.text("SELECT * FROM user_preferences ORDER BY user_id")).all()
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()

    metadata = sa.MetaData()
    old = sa.Table("user_preferences", metadata, autoload_with=connection)
    new = sa.Table("user_ai_settings", metadata, autoload_with=connection)
    assert (
        connection.execute(sa.text("SELECT * FROM user_preferences ORDER BY user_id")).all()
        == before
    )
    copied = connection.execute(
        sa.select(*(new.c[column] for column in COPY_COLUMNS)).order_by(new.c.user_id)
    ).all()
    expected = connection.execute(
        sa.select(*(old.c[column] for column in COPY_COLUMNS)).order_by(old.c.user_id)
    ).all()
    assert copied == expected
    for table in (old, new):
        ciphertext_bytes = connection.execute(
            sa.select(sa.cast(table.c.ai_api_key_encrypted, sa.LargeBinary)).order_by(
                table.c.user_id
            )
        ).all()
        assert ciphertext_bytes == [
            (b"ls-byok:v3:synthetic-unreadable-ciphertext==\n",),
            ("  opaque-legacy-\u00e9-value  ".encode(),),
            (None,),
        ]
    assert migration.revision == "ai_settings_2026"
    assert migration.down_revision == "account_settings_2026"


def test_migration_defaults_match_model_and_user_delete_cascades(
    legacy_connection: sa.Connection, migration: ModuleType
) -> None:
    connection = legacy_connection
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()
    table = sa.Table("user_ai_settings", sa.MetaData(), autoload_with=connection)
    connection.execute(table.insert().values(user_id=40))
    defaults = connection.execute(sa.select(table)).mappings().one()
    assert defaults["ai_mode"] == "app_bedrock"
    assert all(defaults[column] is None for column in AI_FIELDS if column != "ai_mode")
    assert defaults["created_at"] is not None
    assert defaults["updated_at"] is not None
    assert set(table.c.keys()) == set(UserAISettings.__table__.c.keys())
    for column in table.c:
        mapped = UserAISettings.__table__.c[column.name]
        assert column.nullable == mapped.nullable
        assert column.primary_key == mapped.primary_key
        assert column.type.compile(dialect=connection.dialect) == mapped.type.compile(
            dialect=connection.dialect
        )
        actual_default = str(column.server_default.arg) if column.server_default else None
        expected_default = (
            str(mapped.server_default.arg.compile(dialect=connection.dialect))
            if mapped.server_default and not isinstance(mapped.server_default.arg, str)
            else mapped.server_default.arg
            if mapped.server_default
            else None
        )
        # PostgreSQL reflects its implicit varchar cast on literal defaults.
        normalized_default = actual_default.split("::", 1)[0] if actual_default else None
        assert (normalized_default.strip("'") if normalized_default else None) == expected_default
    assert list(table.primary_key.columns.keys()) == ["user_id"]
    foreign_key = next(iter(table.c.user_id.foreign_keys))
    assert foreign_key.target_fullname == "users.id"
    assert foreign_key.ondelete == "CASCADE"
    connection.exec_driver_sql("DELETE FROM users WHERE id = 40")
    assert connection.execute(sa.select(table)).all() == []


@pytest.mark.parametrize("unknown_dates", [("created_at",), ("updated_at",), COPY_COLUMNS[-2:]])
def test_copy_preserves_unknown_timestamps(
    legacy_connection: sa.Connection, migration: ModuleType, unknown_dates: tuple[str, ...]
) -> None:
    connection = legacy_connection
    source = sa.Table("user_preferences", sa.MetaData(), autoload_with=connection)
    values = {
        "id": 501,
        "user_id": 10,
        "ai_mode": "byok",
        "ai_provider": "bedrock",
        "ai_model": "synthetic-model|us-east-1",
        "ai_api_key_encrypted": "opaque-synthetic-ciphertext==",
        "ai_daily_token_limit": 0,
        "ai_monthly_token_limit": None,
        "created_at": datetime(2025, 1, 2, 3, 4, 5, tzinfo=UTC),
        "updated_at": datetime(2026, 9, 17, 10, 20, 30, tzinfo=UTC),
        **dict.fromkeys(unknown_dates),
    }
    connection.execute(source.insert().values(**values))
    expected = connection.execute(sa.select(*(source.c[column] for column in COPY_COLUMNS))).one()

    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()

    target = sa.Table("user_ai_settings", sa.MetaData(), autoload_with=connection)
    copied = connection.execute(sa.select(*(target.c[column] for column in COPY_COLUMNS))).one()
    assert copied == expected
    assert all(copied._mapping[field] is None for field in unknown_dates)


def test_downgrade_refuses_to_discard_new_credentials(migration: ModuleType) -> None:
    with pytest.raises(CommandError, match="no supported downgrade"):
        migration.downgrade()


def test_anonymous_defaults_are_retained_without_inventing_an_owner(
    legacy_connection: sa.Connection, migration: ModuleType
) -> None:
    connection = legacy_connection
    connection.exec_driver_sql("INSERT INTO user_preferences (id) VALUES (999)")
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()
    assert connection.execute(sa.text("SELECT user_id FROM user_ai_settings")).all() == []
    assert connection.execute(sa.text("SELECT id FROM user_preferences")).all() == [(999,)]


@pytest.mark.parametrize(
    "values",
    [
        {"ai_mode": "byok"},
        {"ai_provider": "bedrock"},
        {"ai_model": "synthetic-model"},
        {"ai_api_key_encrypted": "opaque-synthetic-ciphertext"},
        {"ai_api_key_encrypted": ""},
        {"ai_daily_token_limit": 0},
        {"ai_monthly_token_limit": 100},
    ],
)
def test_ownerless_settings_fail_before_ddl_without_losing_data(
    legacy_connection: sa.Connection, migration: ModuleType, values: dict
) -> None:
    connection = legacy_connection
    table = sa.Table("user_preferences", sa.MetaData(), autoload_with=connection)
    connection.execute(table.insert().values(id=999, **values))
    before = connection.execute(sa.select(table)).all()
    with (
        Operations.context(MigrationContext.configure(connection)),
        pytest.raises(RuntimeError, match="unknown owner"),
    ):
        migration.upgrade()
    assert "user_ai_settings" not in sa.inspect(connection).get_table_names()
    assert connection.execute(sa.select(table)).all() == before


@pytest.mark.parametrize("owners", [[999], [10, 10]])
def test_unknown_or_duplicate_owners_fail_before_ddl(
    legacy_connection: sa.Connection, migration: ModuleType, owners: list[int]
) -> None:
    connection = legacy_connection
    table = sa.Table("user_preferences", sa.MetaData(), autoload_with=connection)
    connection.execute(
        table.insert(),
        [
            {
                "id": index,
                "user_id": owner,
                "ai_api_key_encrypted": f"opaque-synthetic-ciphertext-{index}",
            }
            for index, owner in enumerate(owners, start=1)
        ],
    )
    before = connection.execute(sa.select(table)).all()
    with (
        Operations.context(MigrationContext.configure(connection)),
        pytest.raises(RuntimeError, match=r"unknown owner|Duplicate AI settings owners"),
    ):
        migration.upgrade()
    assert "user_ai_settings" not in sa.inspect(connection).get_table_names()
    assert connection.execute(sa.select(table)).all() == before


def test_real_migration_chain_copies_ai_settings_from_predecessor() -> None:
    """Preserve unknown dates through the real backfill and final cutover chain."""
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.connect() as connection:
        config = Config()
        config.set_main_option(
            "script_location",
            (Path(__file__).resolve().parents[2] / "src/ledger_sync/db/migrations").as_posix(),
        )
        config.attributes["connection"] = connection
        command.upgrade(config, "account_settings_2026")
        user_id = connection.execute(
            User.__table__.insert()
            .values(email="migration-ai@example.test", hashed_password="")
            .returning(User.id)
        ).scalar_one()
        connection.execute(UserPreferences.__table__.insert().values(user_id=user_id))
        connection.execute(
            sa.text(
                "UPDATE user_preferences SET ai_mode = 'byok', ai_provider = 'anthropic', "
                "ai_model = 'synthetic-model', ai_api_key_encrypted = :ciphertext, "
                "ai_daily_token_limit = 0, ai_monthly_token_limit = NULL, "
                "created_at = NULL, updated_at = NULL "
                "WHERE user_id = :user_id"
            ),
            {"ciphertext": "opaque-synthetic-ciphertext==", "user_id": user_id},
        )
        connection.commit()
        command.upgrade(config, "ai_settings_2026")

        copied = connection.execute(sa.select(UserAISettings.__table__)).mappings().one()
        assert copied["user_id"] == user_id
        assert copied["ai_mode"] == "byok"
        assert copied["ai_provider"] == "anthropic"
        assert copied["ai_model"] == "synthetic-model"
        assert copied["ai_api_key_encrypted"] == "opaque-synthetic-ciphertext=="
        assert copied["ai_daily_token_limit"] == 0
        assert copied["ai_monthly_token_limit"] is None
        assert copied["created_at"] is None
        assert copied["updated_at"] is None
        old_columns = {
            column["name"] for column in sa.inspect(connection).get_columns("user_preferences")
        }
        assert set(AI_FIELDS) <= old_columns
        connection.commit()
        command.upgrade(config, "domain_storage_cutover_2026")
        assert connection.execute(sa.select(UserAISettings.__table__)).mappings().one() == copied
    engine.dispose()

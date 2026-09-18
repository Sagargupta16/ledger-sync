"""Frozen account settings migration on disposable databases only."""

import os
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from importlib import import_module
from pathlib import Path
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations

MIGRATION = import_module("ledger_sync.db.migrations.versions.20260918_1000_account_settings")
MIGRATIONS = Path(__file__).resolve().parents[2] / "src/ledger_sync/db/migrations"


@pytest.fixture(params=["sqlite", "postgresql"])
def account_db(request):
    schema = None
    if request.param == "postgresql":
        url = os.environ.get("LEDGER_SYNC_TEST_POSTGRES_URL")
        if not url:
            pytest.skip("Requires explicitly provided local disposable PostgreSQL URL")
        parsed = sa.make_url(url)
        if parsed.host not in {"localhost", "127.0.0.1", "::1"} or not (
            parsed.database or ""
        ).startswith("ledger_sync_test"):
            pytest.fail("Only a local ledger_sync_test* PostgreSQL database is allowed")
        engine = sa.create_engine(parsed)
        schema = f"account_settings_{uuid4().hex}"
    else:
        engine = sa.create_engine("sqlite:///:memory:")
    with engine.connect() as connection:
        if schema:
            connection.execute(sa.schema.CreateSchema(schema))
            connection.exec_driver_sql(f'SET search_path TO "{schema}"')
        metadata = sa.MetaData()
        users = sa.Table("users", metadata, sa.Column("id", sa.Integer, primary_key=True))
        accounts = sa.Table(
            "ledger_accounts",
            metadata,
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
            sa.Column("key", sa.String(765), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.UniqueConstraint("user_id", "key"),
            sa.UniqueConstraint("user_id", "id"),
        )
        aliases = sa.Table(
            "ledger_account_aliases",
            metadata,
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("user_id", sa.Integer, nullable=False),
            sa.Column("account_id", sa.Integer, nullable=False),
            sa.Column("source_key", sa.String(765), nullable=False),
            sa.Column("label", sa.String(255), nullable=False),
            sa.UniqueConstraint("user_id", "source_key"),
            sa.ForeignKeyConstraint(
                ["user_id", "account_id"], ["ledger_accounts.user_id", "ledger_accounts.id"]
            ),
        )
        classifications = sa.Table(
            "account_classifications",
            metadata,
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
            sa.Column("account_name", sa.String(255), nullable=False),
            sa.Column(
                "account_type", sa.Enum(*MIGRATION._TYPES, name="accounttype"), nullable=False
            ),
            sa.Column("is_closed", sa.Boolean, nullable=False, server_default=sa.false()),
            sa.Column("closed_date", sa.DateTime),
            sa.Column("created_at", sa.DateTime),
            sa.Column("updated_at", sa.DateTime),
        )
        preferences = sa.Table(
            "user_preferences",
            metadata,
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), primary_key=True),
            sa.Column("credit_card_limits", sa.Text, nullable=False),
        )
        transactions = sa.Table(
            "transactions",
            metadata,
            sa.Column("transaction_id", sa.String, primary_key=True),
            sa.Column("user_id", sa.Integer, nullable=False),
            sa.Column("account_id", sa.Integer),
            sa.Column("account", sa.String),
            sa.Column("source_fingerprint", sa.String),
            sa.Column("is_deleted", sa.Boolean),
            sa.ForeignKeyConstraint(
                ["user_id", "account_id"], ["ledger_accounts.user_id", "ledger_accounts.id"]
            ),
        )
        tags = sa.Table(
            "transaction_tags",
            metadata,
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column(
                "transaction_id",
                sa.String,
                sa.ForeignKey("transactions.transaction_id", ondelete="CASCADE"),
            ),
            sa.Column("tag", sa.String),
        )
        metadata.create_all(connection)
        connection.execute(users.insert(), [{"id": 1}, {"id": 2}])
        connection.execute(
            accounts.insert(),
            [
                {"user_id": 1, "key": "card", "name": "Card"},
                {"user_id": 2, "key": "card", "name": "CARD"},
            ],
        )
        identities = (
            connection.execute(sa.select(accounts.c.id).order_by(accounts.c.user_id))
            .scalars()
            .all()
        )
        connection.execute(
            aliases.insert(),
            [
                {"user_id": owner, "source_key": "card", "label": name, "account_id": identity}
                for owner, name, identity in zip((1, 2), ("Card", "CARD"), identities, strict=True)
            ],
        )
        connection.execute(
            classifications.insert(),
            [
                {"user_id": 1, "account_name": "CARD", "account_type": "CREDIT_CARDS"},
                {"user_id": 2, "account_name": "Card", "account_type": "BANK_ACCOUNTS"},
            ],
        )
        connection.execute(
            preferences.insert(),
            [
                {"user_id": 1, "credit_card_limits": '{"cArD":12345.67,"New Wallet":0}'},
                {"user_id": 2, "credit_card_limits": '{"CARD":987.65}'},
            ],
        )
        connection.execute(
            transactions.insert(),
            [
                {
                    "transaction_id": "keep",
                    "user_id": 1,
                    "account_id": identities[0],
                    "account": "cArD",
                    "source_fingerprint": "immutable",
                    "is_deleted": True,
                }
            ],
        )
        connection.execute(tags.insert(), {"id": 5, "transaction_id": "keep", "tag": "keep child"})
        connection.commit()
        if not schema:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()
        try:
            yield connection
        finally:
            connection.rollback()
            if schema:
                connection.exec_driver_sql("SET search_path TO public")
                connection.execute(sa.schema.DropSchema(schema, cascade=True))
                connection.commit()
    engine.dispose()


def _upgrade(connection):
    with Operations.context(MigrationContext.configure(connection)):
        MIGRATION.upgrade()


def test_backfill_retains_history_owners_aliases_and_legacy_sources(account_db):
    connection = account_db
    tables = ("transactions", "transaction_tags", "account_classifications", "user_preferences")
    queries = {
        name: sa.select(sa.Table(name, sa.MetaData(), autoload_with=connection)) for name in tables
    }
    snapshots = {name: connection.execute(query).all() for name, query in queries.items()}
    alias_snapshot = connection.execute(
        sa.text("SELECT * FROM ledger_account_aliases ORDER BY id")
    ).all()
    _upgrade(connection)
    connection.commit()
    accounts = sa.Table("ledger_accounts", sa.MetaData(), autoload_with=connection)
    rows = connection.execute(sa.select(accounts).order_by(accounts.c.id)).mappings().all()
    assert (rows[0]["name"], rows[0]["account_type"], rows[0]["credit_limit"]) == (
        "Card",
        "CREDIT_CARDS",
        Decimal("12345.67"),
    )
    assert (rows[1]["name"], rows[1]["account_type"], rows[1]["credit_limit"]) == (
        "CARD",
        "BANK_ACCOUNTS",
        Decimal("987.65"),
    )
    assert rows[2]["name"] == "New Wallet" and rows[2]["account_type"] is None
    assert rows[2]["credit_limit"] == Decimal(0) and rows[2]["is_closed"] is False
    for name in tables:
        assert connection.execute(queries[name]).all() == snapshots[name]
    assert (
        connection.execute(sa.text("SELECT * FROM ledger_account_aliases ORDER BY id")).all()[:2]
        == alias_snapshot
    )
    _upgrade(connection)
    assert connection.execute(sa.select(accounts).order_by(accounts.c.id)).mappings().all() == rows
    if connection.dialect.name == "sqlite":
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []


@pytest.mark.parametrize(
    "limits",
    [
        '{"Card":1,"CARD":2}',
        '{"Card":1,"Card":2}',
        '{"New":10,"Card":1.001}',
        '{"Card":-1}',
        '{"Card":true}',
        '{"Card":1,"Card":true}',
        '{"Card":1e50}',
        '{"Card":NaN}',
        "[]",
        "invalid",
    ],
)
def test_bad_limits_fail_before_schema_or_data_changes(account_db, limits):
    connection = account_db
    connection.execute(
        sa.text("UPDATE user_preferences SET credit_card_limits=:limits WHERE user_id=1"),
        {"limits": limits},
    )
    connection.commit()
    before = connection.execute(sa.text("SELECT * FROM ledger_accounts ORDER BY id")).all()
    with pytest.raises(RuntimeError):
        _upgrade(connection)
    assert "account_type" not in {
        c["name"] for c in sa.inspect(connection).get_columns("ledger_accounts")
    }
    assert connection.execute(sa.text("SELECT * FROM ledger_accounts ORDER BY id")).all() == before


def test_conflicting_classifications_fail_before_schema_changes(account_db):
    connection = account_db
    connection.execute(
        sa.text(
            "INSERT INTO account_classifications (user_id,account_name,account_type,is_closed) "
            "VALUES (1,'card','BANK_ACCOUNTS',false)"
        )
    )
    connection.commit()
    with pytest.raises(RuntimeError, match="Conflicting legacy classifications"):
        _upgrade(connection)
    assert "account_type" not in {
        c["name"] for c in sa.inspect(connection).get_columns("ledger_accounts")
    }


def test_equivalent_classifications_preserve_closure_and_audit_timestamps(account_db):
    connection = account_db
    legacy = sa.Table("account_classifications", sa.MetaData(), autoload_with=connection)
    early = datetime(2026, 1, 1, tzinfo=UTC).replace(tzinfo=None)
    late = early + timedelta(days=30)
    connection.execute(
        legacy.update()
        .where(legacy.c.user_id == 1)
        .values(is_closed=True, closed_date=late, created_at=late, updated_at=late)
    )
    connection.execute(
        legacy.insert(),
        {
            "user_id": 1,
            "account_name": "card",
            "account_type": "CREDIT_CARDS",
            "is_closed": True,
            "closed_date": late,
            "created_at": early,
            "updated_at": early,
        },
    )
    connection.execute(
        legacy.insert(),
        {
            "user_id": 1,
            "account_name": "Settings Only",
            "account_type": "OTHER_WALLETS",
            "is_closed": False,
            "created_at": early,
            "updated_at": late,
        },
    )
    connection.commit()
    _upgrade(connection)
    accounts = sa.Table("ledger_accounts", sa.MetaData(), autoload_with=connection)
    card = (
        connection.execute(
            sa.select(accounts).where(accounts.c.user_id == 1, accounts.c.key == "card")
        )
        .mappings()
        .one()
    )
    assert card["is_closed"] is True and card["closed_date"] == late
    assert card["created_at"] == early and card["updated_at"] == late
    settings_only = (
        connection.execute(sa.select(accounts).where(accounts.c.name == "Settings Only"))
        .mappings()
        .one()
    )
    assert settings_only["account_type"] == "OTHER_WALLETS"
    assert settings_only["credit_limit"] is None


def test_alias_limits_and_unicode_labels_resolve_without_rewriting_names(account_db):
    connection = account_db
    identity = connection.execute(
        sa.text("SELECT id FROM ledger_accounts WHERE user_id=1 AND key='card'")
    ).scalar_one()
    connection.execute(
        sa.text(
            "INSERT INTO ledger_account_aliases (user_id, account_id, source_key, label) "
            "VALUES (1,:identity,'old card','Old Card')"
        ),
        {"identity": identity},
    )
    limits = '{"OLD CARD":0.01,"Card":0.01,"İBANK":9999999999999.99,"i̇bank":9999999999999.99}'
    connection.execute(
        sa.text("UPDATE user_preferences SET credit_card_limits=:limits WHERE user_id=1"),
        {"limits": limits},
    )
    connection.commit()
    _upgrade(connection)
    accounts = sa.Table("ledger_accounts", sa.MetaData(), autoload_with=connection)
    limits = dict(
        connection.execute(
            sa.select(accounts.c.name, accounts.c.credit_limit).where(accounts.c.user_id == 1)
        ).all()
    )
    assert limits == {"Card": Decimal("0.01"), "İBANK": Decimal("9999999999999.99")}


def test_canonical_alias_collision_fails_before_mutation(account_db):
    connection = account_db
    accounts = sa.Table("ledger_accounts", sa.MetaData(), autoload_with=connection)
    identity = connection.execute(
        accounts.insert().values(user_id=1, key="other", name="Other")
    ).inserted_primary_key[0]
    connection.execute(
        sa.text("UPDATE ledger_account_aliases SET account_id=:identity WHERE user_id=1"),
        {"identity": identity},
    )
    connection.commit()
    with pytest.raises(RuntimeError, match="Ambiguous"):
        _upgrade(connection)
    assert "account_type" not in {
        c["name"] for c in sa.inspect(connection).get_columns("ledger_accounts")
    }


def test_conflicting_closed_dates_fail_before_mutation(account_db):
    connection = account_db
    legacy = sa.Table("account_classifications", sa.MetaData(), autoload_with=connection)
    connection.execute(
        legacy.insert(),
        {
            "user_id": 1,
            "account_name": "card",
            "account_type": "CREDIT_CARDS",
            "is_closed": True,
            "closed_date": datetime(2026, 1, 1, tzinfo=UTC).replace(tzinfo=None),
        },
    )
    connection.commit()
    with pytest.raises(RuntimeError, match="Conflicting legacy classifications"):
        _upgrade(connection)
    assert "account_type" not in {
        c["name"] for c in sa.inspect(connection).get_columns("ledger_accounts")
    }


def test_complete_revision_chain_is_additive_on_sqlite():
    engine = sa.create_engine("sqlite:///:memory:")
    config = Config()
    config.set_main_option("script_location", MIGRATIONS.as_posix())
    with engine.connect() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "live_index_predicates_2026")
        connection.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.commit()
        command.upgrade(config, "account_settings_2026")
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
        assert sa.inspect(connection).has_table("account_classifications")
        assert "credit_card_limits" in {
            col["name"] for col in sa.inspect(connection).get_columns("user_preferences")
        }
    engine.dispose()

"""Row-level security on a native PostgreSQL schema.

Each case migrates a new schema to head, then reads and writes through a
NOSUPERUSER, NOBYPASSRLS probe role (the kind of role the app will connect as
after activation) next to the owner connection (what it connects as today).
SQLite has no row security, so every case needs LEDGER_SYNC_TEST_POSTGRES_URL
to name a local ledger_sync_test* database, exactly like
test_migrations_from_scratch.py, and is skipped without it. CI runs them in the
postgres-migrations job as the initdb superuser.
"""

from __future__ import annotations

import os
from collections.abc import Generator
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.orm import Session

from ledger_sync.api.mcp_tools import _read_only
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType, User, UserPreferences
from ledger_sync.db.row_security import RLS_SETTING, bind_rls_user, unbind_rls_user

MIGRATIONS = Path(__file__).resolve().parents[2] / "src/ledger_sync/db/migrations"
POLICY = "ledger_sync_user_isolation"
PREDECESSOR = "idempotency_keys_2026"
# Not user-owned: public AMFI NAV data, and an import log with no owner column.
EXEMPT = {"mf_nav_prices", "column_mapping_logs"}
A_TRANSACTIONS = 3
B_TRANSACTIONS = 2


@dataclass(frozen=True)
class Rls:
    owner: sa.Engine
    app: sa.Engine
    config_connection: sa.Connection
    schema: str
    user_a: int
    user_b: int


def _config(connection: sa.Connection) -> Config:
    config = Config()
    config.set_main_option("script_location", MIGRATIONS.as_posix())
    config.attributes["connection"] = connection
    return config


def _search_path_on_connect(engine: sa.Engine, schema: str, role: str | None = None) -> None:
    @sa.event.listens_for(engine, "connect")
    def _configure(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        if role:
            cursor.execute(f'SET ROLE "{role}"')
        cursor.execute(f'SET search_path TO "{schema}"')
        cursor.close()
        dbapi_connection.commit()  # a rollback on return must not undo them


def _seed(connection: sa.Connection) -> tuple[int, int]:
    """Two users with preferences and a few transactions each, as the owner."""
    moment = datetime(2026, 9, 1, tzinfo=UTC).replace(tzinfo=None)
    ids: list[int] = []
    with Session(connection) as session:
        for label, count in (("a", A_TRANSACTIONS), ("b", B_TRANSACTIONS)):
            user = User(
                email=f"rls-{label}@example.test",
                is_active=True,
                is_verified=True,
                hashed_password="",
            )
            session.add(user)
            session.flush()
            session.add(UserPreferences(user_id=user.id, essential_categories="[]"))
            for number in range(count):
                session.add(
                    Transaction(
                        user_id=user.id,
                        transaction_id=f"{label}-{number}",
                        date=moment,
                        amount=Decimal("10.00"),
                        currency="INR",
                        type=TransactionType.EXPENSE,
                        account="Synthetic bank",
                        category="Synthetic category",
                        note="seed",
                        source_file="synthetic.csv",
                        last_seen_at=moment,
                        is_deleted=False,
                    )
                )
            ids.append(user.id)
        session.commit()
    return ids[0], ids[1]


@pytest.fixture
def rls() -> Generator[Rls]:
    url = os.environ.get("LEDGER_SYNC_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Set LEDGER_SYNC_TEST_POSTGRES_URL to run local PostgreSQL migrations")
    parsed = sa.make_url(url)
    if parsed.host not in {"localhost", "127.0.0.1", "::1"} or not (
        parsed.database or ""
    ).startswith("ledger_sync_test"):
        pytest.fail("PostgreSQL migration tests require a local ledger_sync_test* database")

    schema = f"ledger_sync_rls_{uuid4().hex}"
    role = f"ledger_sync_rls_{uuid4().hex[:16]}"
    owner = sa.create_engine(parsed)
    # One pooled connection, so a bound session's transaction-local setting is
    # followed by an unbound session on the very same connection.
    app = sa.create_engine(parsed, pool_size=1, max_overflow=0)
    _search_path_on_connect(owner, schema)
    _search_path_on_connect(app, schema, role)
    with owner.connect() as connection:
        try:
            connection.execute(sa.schema.CreateSchema(schema))
            connection.exec_driver_sql(f'SET search_path TO "{schema}"')
            connection.exec_driver_sql(
                f'CREATE ROLE "{role}" NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE'
            )
            connection.commit()
            command.upgrade(_config(connection), "head")
            connection.commit()
            user_a, user_b = _seed(connection)
            connection.commit()
            connection.exec_driver_sql(f'GRANT USAGE ON SCHEMA "{schema}" TO "{role}"')
            connection.exec_driver_sql(
                f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "{schema}" '
                f'TO "{role}"'
            )
            connection.exec_driver_sql(
                f'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "{schema}" TO "{role}"'
            )
            connection.commit()
            yield Rls(owner, app, connection, schema, user_a, user_b)
        finally:
            connection.rollback()
            app.dispose()
            connection.exec_driver_sql("RESET ROLE")
            connection.exec_driver_sql("SET search_path TO public")
            connection.exec_driver_sql(f'DROP OWNED BY "{role}"')
            connection.exec_driver_sql(f'DROP ROLE IF EXISTS "{role}"')
            connection.execute(sa.schema.DropSchema(schema, cascade=True))
            connection.commit()
    owner.dispose()


def _count(session: Session | sa.Connection, table: str) -> int:
    statement = sa.select(sa.func.count()).select_from(Base.metadata.tables[table])
    return int(session.execute(statement).scalar_one())


def _bound(rls: Rls, user_id: int | None) -> Session:
    session = Session(rls.app)
    if user_id is not None:
        bind_rls_user(session, user_id)
    return session


def _setting(session: Session) -> str | None:
    return session.execute(sa.text(f"SELECT current_setting('{RLS_SETTING}', true)")).scalar_one()


def _foreign_transaction(owner_id: int) -> Transaction:
    moment = datetime(2026, 9, 2, tzinfo=UTC).replace(tzinfo=None)
    return Transaction(
        user_id=owner_id,
        transaction_id="planted",
        date=moment,
        amount=Decimal("1.00"),
        currency="INR",
        type=TransactionType.EXPENSE,
        account="Synthetic bank",
        category="Synthetic category",
        source_file="synthetic.csv",
        last_seen_at=moment,
        is_deleted=False,
    )


def test_policy_covers_every_user_owned_table(rls: Rls) -> None:
    owned = {name for name, table in Base.metadata.tables.items() if "user_id" in table.c}
    owned.add("users")
    with rls.owner.connect() as connection:
        policies = set(
            connection.execute(
                sa.text(
                    "SELECT tablename FROM pg_policies WHERE schemaname = :s AND policyname = :p"
                ),
                {"s": rls.schema, "p": POLICY},
            ).scalars()
        )
        tables = set(
            connection.execute(
                sa.text("SELECT tablename FROM pg_tables WHERE schemaname = :s"),
                {"s": rls.schema},
            ).scalars()
        ) - {"alembic_version"}
        flags = {
            name: (enabled, forced)
            for name, enabled, forced in connection.execute(
                sa.text(
                    "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c "
                    "JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = :s AND c.relkind = 'r'"
                ),
                {"s": rls.schema},
            )
        }

    assert policies == owned, "a user-owned table needs a policy, or an entry in EXEMPT"
    assert tables - policies == EXEMPT
    for table in policies:
        assert flags[table] == (True, False), table


def test_owner_ignores_binding(rls: Rls) -> None:
    with rls.owner.connect() as connection:
        connection.execute(
            sa.text("SELECT set_config(:n, :v, false)"), {"n": RLS_SETTING, "v": str(rls.user_a)}
        )

        assert _count(connection, "transactions") == A_TRANSACTIONS + B_TRANSACTIONS
        assert _count(connection, "users") == 2
        connection.rollback()


def test_unbound_restricted_role_sees_all(rls: Rls) -> None:
    with _bound(rls, rls.user_a) as session:
        assert _count(session, "transactions") == A_TRANSACTIONS
    # Same pooled connection: it now reads the setting as '' (not NULL).
    with _bound(rls, None) as session:
        assert _count(session, "transactions") == A_TRANSACTIONS + B_TRANSACTIONS
        assert _count(session, "users") == 2
        assert _count(session, "user_preferences") == 2


def test_bound_restricted_role_sees_only_own_rows(rls: Rls) -> None:
    with _bound(rls, rls.user_a) as session:
        assert _count(session, "transactions") == A_TRANSACTIONS
        assert session.execute(sa.select(User.id)).scalars().all() == [rls.user_a]
        assert session.execute(sa.select(UserPreferences.user_id)).scalars().all() == [rls.user_a]
        assert (
            session.execute(
                sa.select(sa.func.count()).where(Transaction.user_id == rls.user_b)
            ).scalar_one()
            == 0
        )


def test_bound_write_for_other_user_rejected(rls: Rls) -> None:
    transactions = Base.metadata.tables["transactions"]
    with _bound(rls, rls.user_a) as session:
        session.add(_foreign_transaction(rls.user_b))
        with pytest.raises(sa.exc.ProgrammingError, match="row-level security"):
            session.flush()
        session.rollback()

        updated = session.execute(transactions.update().values(note="touched"))
        deleted = session.execute(transactions.delete().where(transactions.c.note == "touched"))
        assert updated.rowcount == A_TRANSACTIONS
        assert deleted.rowcount == A_TRANSACTIONS
        session.commit()

    with rls.owner.connect() as connection:
        remaining = connection.execute(sa.select(transactions.c.user_id, transactions.c.note)).all()
    assert remaining == [(rls.user_b, "seed")] * B_TRANSACTIONS


def test_binding_survives_commit_and_rollback(rls: Rls) -> None:
    with _bound(rls, rls.user_a) as session:
        assert _setting(session) == str(rls.user_a)
        session.commit()
        assert _setting(session) == str(rls.user_a)
        assert _count(session, "transactions") == A_TRANSACTIONS
        session.rollback()
        assert _setting(session) == str(rls.user_a)
        assert _count(session, "transactions") == A_TRANSACTIONS


def test_unbind_restores_cross_user_reads(rls: Rls) -> None:
    with _bound(rls, rls.user_a) as session:
        assert _count(session, "users") == 1
        unbind_rls_user(session)
        assert _count(session, "users") == 2
        session.commit()
        assert _count(session, "transactions") == A_TRANSACTIONS + B_TRANSACTIONS


def test_account_delete_cascades_under_rls(rls: Rls) -> None:
    with _bound(rls, rls.user_a) as session:
        removed = session.execute(
            sa.delete(Base.metadata.tables["users"]).where(
                Base.metadata.tables["users"].c.id == rls.user_a
            )
        )
        assert removed.rowcount == 1
        session.commit()

    with _bound(rls, None) as session:
        assert _count(session, "users") == 1
        assert _count(session, "user_preferences") == 1
        assert _count(session, "transactions") == B_TRANSACTIONS
        owners = set(session.execute(sa.select(Transaction.user_id)).scalars())
        assert owners == {rls.user_b}


def test_mcp_read_only_with_bound_user(rls: Rls) -> None:
    transactions = Base.metadata.tables["transactions"]
    with _bound(rls, rls.user_a) as session:
        session.commit()  # the token check ends its own transaction first
        with _read_only(session):
            assert _setting(session) == str(rls.user_a)
            assert _count(session, "transactions") == A_TRANSACTIONS
            with pytest.raises(sa.exc.DBAPIError, match="read-only"):
                session.execute(transactions.update().values(note="touched"))
        session.rollback()

        assert _count(session, "transactions") == A_TRANSACTIONS

    with rls.owner.connect() as connection:
        notes = set(connection.execute(sa.select(transactions.c.note)).scalars())
    assert notes == {"seed"}


def test_downgrade_then_upgrade(rls: Rls) -> None:
    connection = rls.config_connection
    config = _config(connection)
    covered = """
        SELECT count(*) FROM pg_policies WHERE schemaname = :s AND policyname = :p
    """
    enabled = """
        SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = :s AND c.relkind = 'r' AND c.relrowsecurity
    """
    params = {"s": rls.schema, "p": POLICY}

    command.downgrade(config, PREDECESSOR)
    connection.commit()
    assert connection.execute(sa.text(covered), params).scalar_one() == 0
    assert connection.execute(sa.text(enabled), params).scalar_one() == 0
    assert connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one() == (
        PREDECESSOR
    )
    assert _count(connection, "transactions") == A_TRANSACTIONS + B_TRANSACTIONS

    command.upgrade(config, "head")
    connection.commit()
    assert connection.execute(sa.text(covered), params).scalar_one() == len(
        {name for name, table in Base.metadata.tables.items() if "user_id" in table.c} | {"users"}
    )

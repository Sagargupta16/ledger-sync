"""Alembic configuration for application and isolated migration connections."""

from __future__ import annotations

from collections.abc import Iterable
from logging.config import fileConfig
from typing import Any

import sqlalchemy as sa
from alembic import context
from alembic.operations import ops
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Connection, engine_from_config, pool

# Import ALL models for autogenerate detection
from ledger_sync.db import models  # noqa: F401
from ledger_sync.db.base import Base
from ledger_sync.db.migrations.safety import checked_migration_plan

# this is the Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None and not config.attributes.get("skip_logging_config"):
    fileConfig(config.config_file_name)

# Add your model's MetaData object here for 'autogenerate' support
target_metadata = Base.metadata

# ─── autogenerate: documented dialect noise ─────────────────────────────────
# A database migrated to head differs from the ORM in exactly these ways, all
# understood and kept on purpose. Each one is matched by exact table, column or
# index name and exact shape, so `alembic check` and autogenerate still report
# every other difference, including any real change to these same objects.

#: ORM enums the migrations store as VARCHAR. The stored values are the enum
#: names either way; SQLite also reports (and never enforces) the length.
_ENUM_STORED_AS_VARCHAR = frozenset(
    {
        ("anomalies", "anomaly_type"),
        ("category_trends", "transaction_type"),
        ("financial_goals", "status"),
        ("recurring_transactions", "frequency"),
        ("recurring_transactions", "transaction_type"),
        ("scheduled_transactions", "frequency"),
    }
)

#: The pre-authentication bootstrap seeded one ownerless defaults row, which
#: later revisions deliberately preserve, so the migrated column stays nullable.
_NULLABLE_BY_DESIGN = frozenset({("user_preferences", "user_id")})

#: ORM unique constraints that revisions enforce with a same-named unique index
#: instead (avoiding a parent-table rebuild). Both enforce identical uniqueness;
#: the pair is dropped only when BOTH halves are reported, so a missing index
#: still reports the constraint.
_UNIQUE_CONSTRAINT_AS_INDEX: dict[str, tuple[str, frozenset[str]]] = {
    "uq_import_logs_user_file_hash": ("import_logs", frozenset({"user_id", "file_hash"})),
    "uq_transactions_user_id": ("transactions", frozenset({"user_id", "transaction_id"})),
    "uq_users_auth_provider_identity": (
        "users",
        frozenset({"auth_provider", "auth_provider_id"}),
    ),
}


def _compare_type(
    migration_context: MigrationContext,
    _inspected_column: sa.Column[Any],
    metadata_column: sa.Column[Any],
    inspected_type: sa.types.TypeEngine[Any],
    metadata_type: sa.types.TypeEngine[Any],
) -> bool | None:
    """No type change for a documented enum stored as VARCHAR; else the default.

    Where the database enforces VARCHAR length (not SQLite), the column must
    still hold every enum label, so a column narrowed below the longest label is
    reported like any other type change.
    """
    if not (
        (metadata_column.table.name, metadata_column.name) in _ENUM_STORED_AS_VARCHAR
        and isinstance(metadata_type, sa.Enum)
        and isinstance(inspected_type, sa.String)
        and not isinstance(inspected_type, sa.Enum)
    ):
        return None
    length = inspected_type.length
    longest = max(len(label) for label in metadata_type.enums)
    if migration_context.dialect.name == "sqlite" or length is None or length >= longest:
        return False
    return None


def _unique_pair_name(op: ops.MigrateOperation, table: str) -> str | None:
    """The documented pair name *op* is one half of, or None."""
    if isinstance(op, ops.DropIndexOp):
        index = op.to_index()
        name, columns = str(op.index_name), {column.name for column in index.columns}
        unique = bool(index.unique)
    elif isinstance(op, ops.CreateUniqueConstraintOp):
        name, columns, unique = str(op.constraint_name), set(op.columns), True
    else:
        return None
    if unique and _UNIQUE_CONSTRAINT_AS_INDEX.get(name) == (table, columns):
        return name
    return None


def _without_noise(table_ops: ops.ModifyTableOps) -> list[ops.MigrateOperation]:
    """*table_ops* minus the documented noise; every other operation is kept."""
    table = table_ops.table_name
    halves: dict[str, set[type]] = {}
    for op in table_ops.ops:
        if (name := _unique_pair_name(op, table)) is not None:
            halves.setdefault(name, set()).add(type(op))
    paired = {name for name, kinds in halves.items() if len(kinds) == 2}

    kept: list[ops.MigrateOperation] = []
    for op in table_ops.ops:
        if _unique_pair_name(op, table) in paired:
            continue
        if (
            isinstance(op, ops.AlterColumnOp)
            and (table, op.column_name) in _NULLABLE_BY_DESIGN
            and op.existing_nullable is True
            and op.modify_nullable is False
        ):
            op.modify_nullable = None
            if not op.has_changes():
                continue
        kept.append(op)
    return kept


def _drop_dialect_noise(
    _context: MigrationContext,
    _revision: object,
    directives: Iterable[ops.MigrationScript],
) -> None:
    """Remove the documented noise from autogenerate (and so `alembic check`)."""
    for script in directives:
        for upgrade_ops, downgrade_ops in zip(
            script.upgrade_ops_list, script.downgrade_ops_list, strict=True
        ):
            for table_ops in upgrade_ops.ops:
                if isinstance(table_ops, ops.ModifyTableOps):
                    table_ops.ops = _without_noise(table_ops)
            upgrade_ops.ops = [
                op
                for op in upgrade_ops.ops
                if not (isinstance(op, ops.ModifyTableOps) and op.is_empty())
            ]
            upgrade_ops.reverse_into(downgrade_ops)


def _database_url() -> str:
    """Explicit test URLs take precedence without loading application settings."""
    db_url = config.attributes.get("database_url")
    if db_url is None:
        from ledger_sync.config.settings import settings

        db_url = settings.database_url
    if db_url.startswith(("postgresql://", "postgresql+psycopg2://")):
        db_url = db_url.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return db_url


def _configure_context(**options: object) -> None:
    context.configure(target_metadata=target_metadata, **options)
    migrate = context.get_context().opts["fn"]
    context.configure(
        target_metadata=target_metadata,
        fn=checked_migration_plan(migrate),
        compare_type=_compare_type,
        process_revision_directives=_drop_dialect_noise,
        **options,
    )


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    _configure_context(
        url=_database_url(),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def _run_on_connection(connection: Connection) -> None:
    _configure_context(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Use a supplied isolated connection or the configured application database."""
    connection = config.attributes.get("connection")
    if connection is not None:
        _run_on_connection(connection)
        return

    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    try:
        with connectable.connect() as connection:
            _run_on_connection(connection)
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

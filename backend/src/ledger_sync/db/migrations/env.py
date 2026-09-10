"""Alembic configuration for application and isolated migration connections."""

from logging.config import fileConfig

from alembic import context
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

"""Database session management."""

from collections.abc import Generator
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.config.settings import settings
from ledger_sync.db.base import Base

# Normalise the database URL to use psycopg (v3) driver for PostgreSQL.
# Users may set postgresql:// or postgresql+psycopg2:// — both map to psycopg v3.
_db_url = settings.database_url
if _db_url.startswith(("postgresql://", "postgresql+psycopg2://")):
    _db_url = _db_url.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
    _db_url = _db_url.replace("postgresql://", "postgresql+psycopg://", 1)

# Create engine
_is_sqlite = "sqlite" in _db_url
_engine_kwargs: dict[str, object] = {
    "echo": settings.database_echo,
}
if _is_sqlite:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL pool settings — sized for Neon free tier (limited connections).
    _engine_kwargs["pool_size"] = 5
    _engine_kwargs["max_overflow"] = 3
    _engine_kwargs["pool_pre_ping"] = True
    _engine_kwargs["pool_recycle"] = 300  # recycle connections every 5 min (Neon idle timeout)
    _engine_kwargs["connect_args"] = {"connect_timeout": 10}

engine = create_engine(_db_url, **_engine_kwargs)


# Connection-level settings — applied on every new connection via event listener.
# This is compatible with Neon's pooled connections (which reject startup parameters).
if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection: Any, _connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=-65536")
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

else:

    @event.listens_for(engine, "connect")
    def _set_pg_timeout(dbapi_connection: Any, _connection_record: Any) -> None:
        """Set statement timeout per-connection (compatible with Neon pooler)."""
        cursor = dbapi_connection.cursor()
        cursor.execute("SET statement_timeout = '30s'")
        cursor.close()


# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_session() -> Generator[Session, None, None]:
    """Get database session.

    Only commits if the session has pending changes (new/dirty/deleted objects),
    avoiding unnecessary commits on read-only requests.

    Yields:
        Database session

    """
    session = SessionLocal()
    try:
        yield session
        if session.new or session.dirty or session.deleted:
            session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    """Initialize database (create tables)."""
    Base.metadata.create_all(bind=engine)


def get_engine() -> Engine:
    """Get SQLAlchemy engine."""
    return engine

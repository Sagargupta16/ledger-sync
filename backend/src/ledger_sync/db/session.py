"""Database session management."""

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.config.settings import settings
from ledger_sync.db.base import Base

# Create engine
_is_sqlite = "sqlite" in settings.database_url
_engine_kwargs: dict = {
    "echo": settings.database_echo,
}
if _is_sqlite:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL production pool settings
    _engine_kwargs["pool_size"] = 20
    _engine_kwargs["max_overflow"] = 10
    _engine_kwargs["pool_pre_ping"] = True

engine = create_engine(settings.database_url, **_engine_kwargs)


# SQLite performance PRAGMAs — applied on every new connection
if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        # WAL mode: allows concurrent reads during writes
        cursor.execute("PRAGMA journal_mode=WAL")
        # NORMAL sync: 2-3x faster writes, safe with WAL
        cursor.execute("PRAGMA synchronous=NORMAL")
        # Increase cache to 64MB (default is 2MB)
        cursor.execute("PRAGMA cache_size=-65536")
        # Store temp tables in memory
        cursor.execute("PRAGMA temp_store=MEMORY")
        # Enable FK enforcement
        cursor.execute("PRAGMA foreign_keys=ON")
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


def get_engine():
    """Get SQLAlchemy engine."""
    return engine

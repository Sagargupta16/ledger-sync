"""Database session management."""

from collections.abc import Generator
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.config.settings import settings
from ledger_sync.db.base import Base

# Create engine
engine = create_engine(
    settings.database_url,
    echo=settings.database_echo,
    # SQLite-specific settings
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_session() -> Generator[Session, None, None]:
    """Get database session.

    Yields:
        Database session
    """
    session = SessionLocal()
    try:
        yield session
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

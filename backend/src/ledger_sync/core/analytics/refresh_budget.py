"""Longer database timeouts for the transaction that runs an analytics refresh."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session


def apply_refresh_budget(db: Session) -> None:
    """Raise the statement and idle timeouts for the current transaction only.

    SET LOCAL lasts until the transaction ends, so call this at the start of the
    transaction that runs the refresh, after any earlier commit. Commit or
    rollback restores the connection's normal timeouts. Only PostgreSQL has them.
    """
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text("SET LOCAL statement_timeout = '120s'"))
        db.execute(text("SET LOCAL idle_in_transaction_session_timeout = '300s'"))

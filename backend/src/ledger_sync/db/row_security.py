"""Bind a session to the signed-in user for PostgreSQL row-level security.

Every user-owned table carries the ``ledger_sync_user_isolation`` policy (revision
``row_level_security_2026``): all rows are visible while ``app.user_id`` is unset,
and only the rows of that user once it is set. The policy is a second net under
the ``user_id`` filters every query already has. It is inert until the app
connects as a role that does not own the tables and cannot bypass row security.

``bind_rls_user`` remembers the id on the session and a global ``after_begin``
listener sets ``app.user_id`` (transaction-local) at the start of every
transaction, so the binding survives each commit and rollback and never leaks to
another request on a pooled connection. Paths that read across users on purpose
(admin, cron, OAuth, token refresh) never bind, or call ``unbind_rls_user``.
On SQLite everything here is a no-op.
"""

from __future__ import annotations

from sqlalchemy import Connection, text
from sqlalchemy.event import listen
from sqlalchemy.orm import Session, SessionTransaction

RLS_SETTING = "app.user_id"
_INFO_KEY = "rls_user_id"
_SET_SQL = text("SELECT set_config(:name, :value, true)")


def _set_setting(connection: Connection, user_id: int | None) -> None:
    value = "" if user_id is None else str(user_id)
    connection.execute(_SET_SQL, {"name": RLS_SETTING, "value": value})


def _store(session: Session, user_id: int | None) -> None:
    session.info[_INFO_KEY] = user_id
    if not session.in_transaction():
        return  # the next transaction picks it up in _apply
    if session.get_bind().dialect.name == "postgresql":
        _set_setting(session.connection(), user_id)


def bind_rls_user(session: Session, user_id: int) -> None:
    """Limit the session's rows to *user_id*, now and in every later transaction."""
    _store(session, user_id)


def unbind_rls_user(session: Session) -> None:
    """Let the session read across users again (admin statistics)."""
    _store(session, None)


def _apply(session: Session, _transaction: SessionTransaction, connection: Connection) -> None:
    user_id = session.info.get(_INFO_KEY)
    if user_id is not None and connection.dialect.name == "postgresql":
        _set_setting(connection, user_id)


# Global, so sessions from any sessionmaker (including tests') get it.
listen(Session, "after_begin", _apply)

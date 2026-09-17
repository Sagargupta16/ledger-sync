"""Enforce scheduled-source ownership without repairing or deleting user plans.

Revision ID: scheduled_references_2026
Revises: transaction_invariants_2026
Create Date: 2026-09-17 15:00:00.000000

The detector explicitly unlinks schedules before replacing unconfirmed sources.
This FK uses NO ACTION so deleting a recurring source cannot delete a schedule.
Both tables retain their user-level ON DELETE CASCADE constraints.

Only the scheduled child table may be rebuilt on SQLite. The recurring parent
gets a unique index directly. As with preceding revisions, a rebuild requires a
dedicated SQLite connection with foreign_keys OFF before its transaction starts;
never toggle enforcement inside a transaction or commit the caller's work.
Existing invalid references cause a preflight failure, with no automatic repair.
"""

import sqlalchemy as sa
from alembic import op

from ledger_sync.db.migrations.safety import irreversible

revision: str = "scheduled_references_2026"
down_revision: str | None = "transaction_invariants_2026"
branch_labels: str | None = None
depends_on: str | None = None

_PARENT_INDEX = "uq_recurring_transactions_user_id"
_CHILD_FK = "fk_scheduled_user_recurring"


def _prepare_connection(bind: sa.Connection, needs_rebuild: bool) -> None:
    if bind.dialect.name == "postgresql":
        bind.exec_driver_sql(
            "LOCK TABLE recurring_transactions, scheduled_transactions IN SHARE ROW EXCLUSIVE MODE"
        )
    elif bind.dialect.name == "sqlite":
        if needs_rebuild and bind.exec_driver_sql("PRAGMA foreign_keys").scalar_one():
            raise RuntimeError(
                "Scheduled reference migration requires a dedicated SQLite connection with "
                "PRAGMA foreign_keys=OFF before beginning the migration transaction. "
                "Re-enable enforcement after commit. No records or schema were changed."
            )
        if not bind.connection.driver_connection.in_transaction:
            bind.exec_driver_sql("BEGIN IMMEDIATE")
        else:
            bind.exec_driver_sql("UPDATE scheduled_transactions SET id=id WHERE 1=0")
    else:
        raise RuntimeError("Scheduled references support SQLite and PostgreSQL only.")


def _preflight(bind: sa.Connection) -> None:
    invalid = (
        bind.execute(
            sa.text(
                "SELECT scheduled.id FROM scheduled_transactions AS scheduled "
                "LEFT JOIN recurring_transactions AS recurring "
                "ON recurring.id = scheduled.recurring_transaction_id "
                "AND recurring.user_id = scheduled.user_id "
                "WHERE scheduled.recurring_transaction_id IS NOT NULL AND recurring.id IS NULL "
                "ORDER BY scheduled.id LIMIT 5"
            )
        )
        .scalars()
        .all()
    )
    if invalid:
        raise RuntimeError(
            f"Invalid scheduled recurring references at scheduled row IDs {invalid}. "
            "Expected (user_id, recurring_transaction_id) to match recurring_transactions "
            "(user_id, id). No records were changed or deleted. Review a verified backup "
            "and resolve these orphan or cross-user references explicitly with their owner "
            "before rerunning; no automatic repair is performed."
        )
    _check_sqlite_foreign_keys(bind)


def _check_sqlite_foreign_keys(bind: sa.Connection) -> None:
    if bind.dialect.name == "sqlite":
        invalid = bind.exec_driver_sql("PRAGMA foreign_key_check").fetchmany(5)
        if invalid:
            raise RuntimeError(
                f"Foreign key validation failed during scheduled references: {invalid}. "
                "Roll back the migration transaction; no automatic repair is performed."
            )


def upgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError("Scheduled references require an online connection for preflight.")
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    foreign_keys = inspector.get_foreign_keys("scheduled_transactions")
    has_reference = any(key["name"] == _CHILD_FK for key in foreign_keys)
    _prepare_connection(bind, needs_rebuild=not has_reference)
    _preflight(bind)
    indexes = {index["name"]: index for index in inspector.get_indexes("recurring_transactions")}
    if _PARENT_INDEX in indexes:
        existing = indexes[_PARENT_INDEX]
        if not existing["unique"] or existing["column_names"] != ["user_id", "id"]:
            raise RuntimeError(
                f"Existing {_PARENT_INDEX} does not match the required unique (user_id, id) key. "
                "No schema changes were made."
            )
    else:
        op.create_index(_PARENT_INDEX, "recurring_transactions", ["user_id", "id"], unique=True)
    if not has_reference:
        with op.batch_alter_table("scheduled_transactions") as batch:
            batch.create_foreign_key(
                _CHILD_FK,
                "recurring_transactions",
                ["user_id", "recurring_transaction_id"],
                ["user_id", "id"],
            )
    _check_sqlite_foreign_keys(bind)


@irreversible
def downgrade() -> None:
    """Recover with a verified backup or forward repair, preserving source ownership."""

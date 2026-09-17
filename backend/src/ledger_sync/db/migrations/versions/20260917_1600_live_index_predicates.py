"""Match PostgreSQL live indexes to the application's IS false filters.

Revision ID: live_index_predicates_2026
Revises: scheduled_references_2026
Create Date: 2026-09-17 16:00:00.000000

Only index predicates change; no transaction or child rows are rewritten.
SQLite's existing IS 0 predicates and schema are left unchanged. Definitions
are frozen here, independent of evolving runtime models.

Release coordination: drain transaction traffic and use the direct PostgreSQL
migration connection. Ordinary DROP INDEX already requires ACCESS EXCLUSIVE on
transactions; acquire it explicitly before preflight and retain it through all
six replacements until the surrounding migration transaction commits. Reads
and writes to this table wait for that entire interval (and long-running readers
can delay lock acquisition). Budget the outage from a representative rehearsal,
including earlier revisions if upgrading the whole chain in one transaction.
There are no intermediate commits or concurrent/nontransactional DDL. Failure
must roll back the surrounding transaction, restoring the original indexes.
"""

import sqlalchemy as sa
from alembic import op

revision: str = "live_index_predicates_2026"
down_revision: str | None = "scheduled_references_2026"
branch_labels: str | None = None
depends_on: str | None = None

_INDEXES = {
    "ix_transactions_user_date": ["user_id", "date"],
    "ix_transactions_user_type_date": ["user_id", "type", "date"],
    "ix_transactions_user_category": ["user_id", "category"],
    "ix_transactions_user_account": ["user_id", "account"],
    "ix_transactions_user_from_account": ["user_id", "from_account"],
    "ix_transactions_user_to_account": ["user_id", "to_account"],
}
_PREDICATES = {"is_deleted = false", "not is_deleted", "is_deleted is false"}


def _replace_predicates(predicate: str) -> None:
    if op.get_context().as_sql:
        raise RuntimeError("Live-index predicate migration requires online catalog preflight.")
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        return
    if bind.dialect.name != "postgresql":
        raise RuntimeError("Live-index predicates support SQLite and PostgreSQL only.")
    bind.exec_driver_sql("LOCK TABLE transactions IN ACCESS EXCLUSIVE MODE")
    definitions = {
        row["name"]: row
        for row in bind.execute(
            sa.text(
                """
                SELECT index_class.relname AS name,
                       pg_get_expr(idx.indpred, idx.indrelid) AS predicate,
                       ARRAY(SELECT pg_get_indexdef(idx.indexrelid, key_number, true)
                             FROM generate_series(1, idx.indnkeyatts) AS key_number) AS keys,
                       idx.indnatts = idx.indnkeyatts AS no_includes,
                       idx.indisvalid AND idx.indisready AS valid,
                       idx.indisunique OR idx.indisprimary OR idx.indisexclusion AS constrained,
                       EXISTS (SELECT 1 FROM pg_constraint
                               WHERE conindid = idx.indexrelid) AS constraint_owned,
                       access_method.amname AS method,
                       index_class.reloptions AS storage_options
                FROM pg_index AS idx
                JOIN pg_class AS index_class ON index_class.oid = idx.indexrelid
                JOIN pg_am AS access_method ON access_method.oid = index_class.relam
                WHERE idx.indrelid = 'transactions'::regclass
                """
            )
        ).mappings()
    }
    pending = []
    # Validate the entire set before dropping even the first index. Unexpected
    # operator classes, expressions, sorting, or collations alter the key text.
    for name, columns in _INDEXES.items():
        current = definitions.get(name)
        actual_predicate = (
            str(current["predicate"]).strip("()").lower() if current is not None else ""
        )
        if (
            current is None
            or list(current["keys"]) != columns
            or not current["no_includes"]
            or not current["valid"]
            or current["constrained"]
            or current["constraint_owned"]
            or current["method"] != "btree"
            or current["storage_options"]
            or actual_predicate not in _PREDICATES
        ):
            raise RuntimeError(
                f"Live-index preflight rejected {name}: expected the existing nonunique "
                f"btree key {columns} with a recognized live-row predicate. "
                "No indexes or rows were changed. Roll back and review schema drift "
                "against a verified backup before retrying; no automatic repair is performed."
            )
        if actual_predicate != predicate.lower():
            pending.append(name)
    for name in pending:
        op.drop_index(name, table_name="transactions")
        op.create_index(
            name,
            "transactions",
            _INDEXES[name],
            unique=False,
            postgresql_where=sa.text(predicate),
        )


def upgrade() -> None:
    _replace_predicates("is_deleted IS false")


def downgrade() -> None:
    """Restore the old predicate atomically; requires the same coordinated lock."""
    _replace_predicates("is_deleted = false")

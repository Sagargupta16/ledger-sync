"""Enforce transaction amounts, accounting currency, and source fingerprint shape.

Revision ID: transaction_invariants_2026
Revises: ledger_dimensions_2026
Create Date: 2026-09-17 14:00:00.000000

The upload/normalizer contract permits zero and finite amounts through
9999999999999.99, stored in INR. An upper bound also rejects PostgreSQL NUMERIC
NaN (which sorts above all finite numbers). Fingerprints are optional; assigned
fingerprints are lowercase SHA-256 digests using the v2 encoding.

Manual transactions currently accept absent/empty transfer endpoints and retain
optional endpoint labels on non-transfers. Do not add a stricter shape invariant
until those writers and the historical-data policy have been coordinated.

SQLite requires a dedicated connection with foreign_keys=OFF before beginning
the migration transaction, as in ledger_dimensions_2026. A parent-table rebuild
with enforcement enabled can cascade-delete annotations. Never toggle it inside
a transaction or commit the caller's work; refuse unsafe execution instead.
The operator must re-enable enforcement after commit.
"""

import sqlalchemy as sa
from alembic import op

from ledger_sync.db.migrations.safety import irreversible

revision: str = "transaction_invariants_2026"
down_revision: str | None = "ledger_dimensions_2026"
branch_labels: str | None = None
depends_on: str | None = None

# Frozen migration definitions; do not import current models or API validators.
_CHECKS = (
    ("ck_transactions_amount_bounds", "amount >= 0 AND amount <= 9999999999999.99"),
    ("ck_transactions_currency_inr", "currency = 'INR'"),
    ("ck_transactions_type", "type IN ('INCOME', 'EXPENSE', 'TRANSFER')"),
    ("ck_transactions_fingerprint_version", "fingerprint_version IN (1, 2)"),
    (
        "ck_transactions_source_fingerprint",
        (
            "source_fingerprint IS NULL OR "
            "(fingerprint_version = 2 AND length(source_fingerprint) = 64 "
            "AND trim(source_fingerprint, '0123456789abcdef') = '')"
        ),
    ),
)


def _prepare_connection(bind: sa.Connection, needs_rebuild: bool) -> None:
    if bind.dialect.name == "sqlite":
        if needs_rebuild and bind.exec_driver_sql("PRAGMA foreign_keys").scalar_one():
            raise RuntimeError(
                "Transaction invariant migration requires a dedicated SQLite connection with "
                "PRAGMA foreign_keys=OFF before beginning the migration transaction, to preserve "
                "transaction children during the table rebuild. Re-enable it after commit. "
                "No records or schema were changed."
            )
        if not bind.connection.driver_connection.in_transaction:
            bind.exec_driver_sql("BEGIN IMMEDIATE")
        else:
            # Upgrade a deferred read transaction to a writer without changing rows.
            bind.exec_driver_sql("UPDATE transactions SET transaction_id=transaction_id WHERE 1=0")
    elif bind.dialect.name == "postgresql":
        bind.exec_driver_sql("LOCK TABLE transactions IN SHARE ROW EXCLUSIVE MODE")
    else:
        raise RuntimeError("Transaction invariants support SQLite and PostgreSQL only.")


def _validate_rows(bind: sa.Connection) -> None:
    for name, predicate in _CHECKS:
        invalid = (
            bind.execute(
                sa.text(
                    f"SELECT transaction_id FROM transactions WHERE NOT ({predicate}) "
                    "ORDER BY transaction_id LIMIT 5"
                )
            )
            .scalars()
            .all()
        )
        if invalid:
            raise RuntimeError(
                f"Cannot add {name}: invalid transactions at IDs {invalid}. "
                f"Expected {predicate}. Active and soft-deleted history must both comply. "
                "No records were changed or deleted. Review a verified backup and resolve "
                "the reported records explicitly with their owner, then rerun the migration."
            )


def _validate_sqlite_foreign_keys(bind: sa.Connection) -> None:
    if bind.dialect.name != "sqlite":
        return
    violations = bind.exec_driver_sql("PRAGMA foreign_key_check").fetchmany(5)
    if violations:
        raise RuntimeError(
            f"Foreign key validation failed during transaction invariants: {violations}. "
            "Roll back the migration transaction and resolve the reported references "
            "from a verified backup; no automatic data repair is performed."
        )


def upgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError(
            "Transaction invariants require an online connection for existing-data preflight."
        )
    bind = op.get_bind()
    existing = {check["name"] for check in sa.inspect(bind).get_check_constraints("transactions")}
    missing = [(name, predicate) for name, predicate in _CHECKS if name not in existing]
    _prepare_connection(bind, needs_rebuild=bool(missing))
    _validate_rows(bind)
    _validate_sqlite_foreign_keys(bind)
    if missing:
        with op.batch_alter_table("transactions") as batch:
            for name, predicate in missing:
                batch.create_check_constraint(name, predicate)
    _validate_sqlite_foreign_keys(bind)


@irreversible
def downgrade() -> None:
    """Recover with a verified backup or forward repair, preserving identity guarantees."""

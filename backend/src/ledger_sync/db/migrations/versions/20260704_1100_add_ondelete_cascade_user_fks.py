"""add ondelete=CASCADE to every user_id FK

Revision ID: cascade_user_fks_2026
Revises: token_version_2026
Create Date: 2026-07-04 11:00:00.000000

The audit found that 19 of 21 user_id foreign keys had no DB-level
``ondelete`` rule -- deletion cascade worked only through the ORM. A
raw-SQL user delete (via ``psql``, a maintenance script, or an admin
tool) would orphan children in most tables. Only AuditLog and
InvestmentHolding declared CASCADE explicitly.

This migration rewrites every user_id FK constraint with
``ondelete='CASCADE'`` so DB-level enforcement matches the ORM's
intent. It also adds CASCADE on the Anomaly -> Transaction FK so
hard-deleting a transaction does not raise IntegrityError from
hanging anomaly rows.

## Postgres vs SQLite

Postgres: ``op.drop_constraint`` + ``op.create_foreign_key`` per FK.
Alembic autogenerates the constraint name using the naming convention
in ``env.py``; when unset we fall back to inspection.

SQLite: ``ALTER TABLE ... DROP CONSTRAINT`` is unsupported. The
standard workaround is ``batch_alter_table``, which recreates the
table with the new schema and copies rows. For dev SQLite this is
fine (tiny data volumes); for prod Postgres the ``batch_alter_table``
would be a no-op since we take the direct-DDL branch first.

Empty ``downgrade`` per repo convention (2026-04-05 onward).
"""

from alembic import op

revision: str = "cascade_user_fks_2026"
down_revision: str | None = "token_version_2026"
branch_labels: str | None = None
depends_on: str | None = None


# (table_name, column_name, referenced_table.column, ondelete). Order is FK-safe
# for both create and drop -- we don't need topological order because we drop and
# recreate each constraint in-place.
_FKS_TO_CASCADE: list[tuple[str, str, str, str]] = [
    # user_id FKs -> users.id
    ("user_preferences", "user_id", "users.id", "CASCADE"),
    ("transactions", "user_id", "users.id", "CASCADE"),
    ("import_logs", "user_id", "users.id", "CASCADE"),
    ("account_classifications", "user_id", "users.id", "CASCADE"),
    ("tax_records", "user_id", "users.id", "CASCADE"),
    ("net_worth_snapshots", "user_id", "users.id", "CASCADE"),
    ("daily_summaries", "user_id", "users.id", "CASCADE"),
    ("monthly_summaries", "user_id", "users.id", "CASCADE"),
    ("category_trends", "user_id", "users.id", "CASCADE"),
    ("transfer_flows", "user_id", "users.id", "CASCADE"),
    ("merchant_intelligence", "user_id", "users.id", "CASCADE"),
    ("fy_summaries", "user_id", "users.id", "CASCADE"),
    ("cohort_spending", "user_id", "users.id", "CASCADE"),
    ("recurring_transactions", "user_id", "users.id", "CASCADE"),
    ("scheduled_transactions", "user_id", "users.id", "CASCADE"),
    ("anomalies", "user_id", "users.id", "CASCADE"),
    ("budgets", "user_id", "users.id", "CASCADE"),
    ("financial_goals", "user_id", "users.id", "CASCADE"),
    ("ai_usage_log", "user_id", "users.id", "CASCADE"),
    # Anomaly.transaction_id -> transactions.transaction_id (was naked, now cascades
    # so hard-deleting a txn does not raise IntegrityError from stale anomaly rows).
    ("anomalies", "transaction_id", "transactions.transaction_id", "CASCADE"),
]


def _is_sqlite() -> bool:
    bind = op.get_bind()
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    if _is_sqlite():
        # batch_alter_table recreates each table with the new FK, copies rows,
        # and swaps. Safe on tiny dev DBs where perf isn't a concern.
        for table, column, ref, ondelete in _FKS_TO_CASCADE:
            ref_table, ref_col = ref.split(".")
            with op.batch_alter_table(table) as batch_op:
                # SQLite constraints are unnamed by default; drop-by-column-name
                # via the naming convention is unreliable. batch_alter_table
                # rebuilds the table, so we just declare the new FK and the old
                # one is dropped implicitly during the swap.
                batch_op.create_foreign_key(
                    f"fk_{table}_{column}_cascade",
                    ref_table,
                    [column],
                    [ref_col],
                    ondelete=ondelete,
                )
        return

    # Postgres path: drop existing FK by discovering its name via information_schema,
    # then create a new one with ondelete. Not using op.drop_constraint(name=...) because
    # the historical constraint names vary (autogen vs manual).
    for table, column, ref, ondelete in _FKS_TO_CASCADE:
        ref_table, ref_col = ref.split(".")
        conn = op.get_bind()
        result = conn.execute(
            _find_fk_name(table, column),
            {"table": table, "column": column},
        ).fetchone()
        if result:
            op.drop_constraint(result[0], table, type_="foreignkey")
        op.create_foreign_key(
            f"fk_{table}_{column}_cascade",
            table,
            ref_table,
            [column],
            [ref_col],
            ondelete=ondelete,
        )


def _find_fk_name(table: str, column: str):  # noqa: ANN202
    """Return SQL that finds the FK constraint name for a (table, column) in Postgres."""
    from sqlalchemy import text

    return text(
        """
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = :table
          AND kcu.column_name = :column
        LIMIT 1
        """
    )


def downgrade() -> None:
    # Per project convention: rollback via DB backup, not down-migration.
    pass

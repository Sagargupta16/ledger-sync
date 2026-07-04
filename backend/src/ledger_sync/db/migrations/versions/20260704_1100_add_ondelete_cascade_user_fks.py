"""add ondelete=CASCADE to every user_id FK

Revision ID: cascade_user_fks_2026
Revises: token_version_2026
Create Date: 2026-07-04 11:00:00.000000

Audit found that 19 of 21 user_id foreign keys had no DB-level
``ondelete`` rule -- deletion cascade worked only through the ORM. Raw
SQL user delete (via psql or an admin tool) would orphan children.

This rewrites every user_id FK constraint with ``ondelete='CASCADE'``
and adds CASCADE on the Anomaly -> Transaction FK so hard-deleting a
transaction doesn't raise IntegrityError from hanging anomaly rows.

## SQLite vs Postgres

Postgres: discover the existing constraint name from
``information_schema``, drop it, create a new one with ondelete.

SQLite: ``ALTER TABLE ... DROP CONSTRAINT`` is unsupported. The correct
alembic pattern is ``batch_alter_table(recreate='always')`` with BOTH
``drop_constraint`` and ``create_foreign_key`` inside the same batch --
alembic then rebuilds the table with the new FK set (drop+create in
the same batch is a REPLACE, not an APPEND).

An earlier version of this migration only did ``create_foreign_key``
without the matching drop; on SQLite the reflected unnamed FK survived
alongside the new named FK, leaving every table with duplicate FKs
pointing at users.id. If you were bitten by that (``PRAGMA
foreign_key_list`` shows more than one row per column), restore your
pre-migration DB backup before running this version.
"""

from alembic import op
from sqlalchemy import inspect

revision: str = "cascade_user_fks_2026"
down_revision: str | None = "token_version_2026"
branch_labels: str | None = None
depends_on: str | None = None


# (table_name, column_name, referenced_table, referenced_column, new_constraint_name).
_FKS_TO_CASCADE: list[tuple[str, str, str, str, str]] = [
    ("user_preferences", "user_id", "users", "id", "fk_user_preferences_user_id_cascade"),
    ("transactions", "user_id", "users", "id", "fk_transactions_user_id_cascade"),
    ("import_logs", "user_id", "users", "id", "fk_import_logs_user_id_cascade"),
    (
        "account_classifications",
        "user_id",
        "users",
        "id",
        "fk_account_classifications_user_id_cascade",
    ),
    ("tax_records", "user_id", "users", "id", "fk_tax_records_user_id_cascade"),
    ("net_worth_snapshots", "user_id", "users", "id", "fk_net_worth_snapshots_user_id_cascade"),
    ("daily_summaries", "user_id", "users", "id", "fk_daily_summaries_user_id_cascade"),
    ("monthly_summaries", "user_id", "users", "id", "fk_monthly_summaries_user_id_cascade"),
    ("category_trends", "user_id", "users", "id", "fk_category_trends_user_id_cascade"),
    ("transfer_flows", "user_id", "users", "id", "fk_transfer_flows_user_id_cascade"),
    (
        "merchant_intelligence",
        "user_id",
        "users",
        "id",
        "fk_merchant_intelligence_user_id_cascade",
    ),
    ("fy_summaries", "user_id", "users", "id", "fk_fy_summaries_user_id_cascade"),
    ("cohort_spending", "user_id", "users", "id", "fk_cohort_spending_user_id_cascade"),
    (
        "recurring_transactions",
        "user_id",
        "users",
        "id",
        "fk_recurring_transactions_user_id_cascade",
    ),
    (
        "scheduled_transactions",
        "user_id",
        "users",
        "id",
        "fk_scheduled_transactions_user_id_cascade",
    ),
    ("anomalies", "user_id", "users", "id", "fk_anomalies_user_id_cascade"),
    ("budgets", "user_id", "users", "id", "fk_budgets_user_id_cascade"),
    ("financial_goals", "user_id", "users", "id", "fk_financial_goals_user_id_cascade"),
    ("ai_usage_log", "user_id", "users", "id", "fk_ai_usage_log_user_id_cascade"),
    # Anomaly -> Transaction: cascade so hard-deleting a txn doesn't fail on
    # stale anomaly rows.
    (
        "anomalies",
        "transaction_id",
        "transactions",
        "transaction_id",
        "fk_anomalies_transaction_id_cascade",
    ),
]


def _is_sqlite() -> bool:
    return op.get_bind().dialect.name == "sqlite"


def _reflect_existing_fk_name(table: str, column: str) -> str | None:
    """Return the current FK constraint name for (table, column), or None.

    On SQLite, unnamed FKs come back as None or auto-generated names -- we
    need this to know what to pass to ``batch_op.drop_constraint``.
    """
    inspector = inspect(op.get_bind())
    for fk in inspector.get_foreign_keys(table):
        if fk.get("constrained_columns") == [column]:
            return fk.get("name")
    return None


def upgrade() -> None:
    if _is_sqlite():
        _upgrade_sqlite()
    else:
        _upgrade_postgres()


def _upgrade_sqlite() -> None:
    """SQLite: reflect actual current FK name per table (which varies --
    some are named by earlier migrations, some are anonymous and get a
    synthesized name from the naming_convention), drop by that reflected
    name, then create the new CASCADE FK in the same batch. All in one
    batch = alembic recreates the table with the new FK set.
    """
    # naming_convention synthesizes a name for anonymous FKs during
    # reflection. Named FKs (created by earlier migrations) keep their
    # explicit name; anonymous ones get fk_<table>_<column>_<referent>.
    naming_convention = {
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    }

    # Group targets by table so tables with multiple FKs to rewrite
    # (anomalies -> users AND anomalies -> transactions) do one batch.
    by_table: dict[str, list[tuple[str, str, str, str]]] = {}
    for table, column, ref_table, ref_col, new_name in _FKS_TO_CASCADE:
        by_table.setdefault(table, []).append((column, ref_table, ref_col, new_name))

    from sqlalchemy import MetaData

    bind = op.get_bind()

    for table, fk_specs in by_table.items():
        # Reflect the table under the naming_convention so anonymous FKs
        # get their synthesized name; already-named FKs keep theirs.
        md = MetaData(naming_convention=naming_convention)
        md.reflect(bind=bind, only=[table])
        current = md.tables[table]

        # Build a map: (local_col, referred_table) -> current constraint name
        current_fk_names: dict[tuple[str, str], str] = {}
        for fkc in current.foreign_key_constraints:
            if not fkc.name:
                continue
            local_col = next(iter(fkc.column_keys), None)
            ref_tbl = fkc.referred_table.name
            if local_col:
                current_fk_names[(local_col, ref_tbl)] = fkc.name

        with op.batch_alter_table(
            table,
            recreate="always",
            naming_convention=naming_convention,
        ) as batch_op:
            for column, ref_table, _ref_col, _new_name in fk_specs:
                existing_name = current_fk_names.get((column, ref_table))
                if existing_name:
                    batch_op.drop_constraint(existing_name, type_="foreignkey")

            for column, ref_table, ref_col, new_name in fk_specs:
                batch_op.create_foreign_key(
                    new_name,
                    ref_table,
                    [column],
                    [ref_col],
                    ondelete="CASCADE",
                )


def _upgrade_postgres() -> None:
    """Postgres: direct DDL. Discover existing constraint name via
    information_schema, drop, then create new with ondelete.
    """
    from sqlalchemy import text

    conn = op.get_bind()
    for table, column, ref_table, ref_col, new_name in _FKS_TO_CASCADE:
        result = conn.execute(
            text(
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
            ),
            {"table": table, "column": column},
        ).fetchone()
        if result:
            op.drop_constraint(result[0], table, type_="foreignkey")
        op.create_foreign_key(
            new_name,
            table,
            ref_table,
            [column],
            [ref_col],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    # Per project convention: rollback via DB backup, not down-migration.
    pass

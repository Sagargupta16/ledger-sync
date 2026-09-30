"""Align migrated nullability and indexes with the ORM without rewriting data.

Revision ID: orm_schema_alignment_2026
Revises: domain_storage_cutover_2026
Create Date: 2026-09-30 10:00:00.000000

A database built only from migrations left 118 columns nullable that the ORM
declares NOT NULL, lacked ten ORM indexes, and kept three duplicate indexes and
one index under a legacy name. ``reconcile_create_all_2026`` may also have left
``import_logs.user_id`` nullable. ``create_all()`` databases can instead carry
``ix_audit_logs_user_id`` and ``ix_investment_holdings_user_id``, duplicates of
``ix_audit_user`` and ``ix_investment_user`` that the ORM no longer declares.
Every step inspects the live schema and changes only what differs.

Current writers supply every tightened value (explicitly or through ORM
defaults), so the backend that deploys before this migration keeps working.
Existing NULL values stop the revision before any change; nothing is
backfilled or deleted. ``user_preferences.user_id`` stays nullable: early
bootstrap revisions seeded one ownerless defaults row that later revisions
deliberately preserve.

SQLite rebuilds parent tables (users, transactions, recurring_transactions). As
in ledger_dimensions_2026, it requires a dedicated connection with
``PRAGMA foreign_keys=OFF`` before the migration transaction begins, so a
rebuild cannot cascade-delete children. PostgreSQL holds ACCESS EXCLUSIVE locks
on the affected tables from validation until commit, with a lock timeout so a
busy table fails the migration instead of queueing application traffic.
Definitions are frozen here, independent of evolving runtime models.
"""

import sqlalchemy as sa
from alembic import op

from ledger_sync.db.migrations.safety import irreversible

revision: str = "orm_schema_alignment_2026"
down_revision: str | None = "domain_storage_cutover_2026"
branch_labels: str | None = None
depends_on: str | None = None

_LOCK_TIMEOUT = "10s"
_NOT_NULL: dict[str, tuple[str, ...]] = {
    "users": ("updated_at",),
    "user_preferences": ("created_at", "updated_at"),
    "transactions": ("user_id",),
    "import_logs": ("user_id",),
    "anomalies": ("is_reviewed", "is_dismissed", "detected_at"),
    "audit_logs": ("created_at",),
    "budgets": (
        "alert_threshold_pct",
        "current_month_spent",
        "current_month_remaining",
        "current_month_pct",
        "avg_monthly_actual",
        "months_over_budget",
        "months_under_budget",
        "is_active",
        "created_at",
        "updated_at",
    ),
    "category_trends": (
        "total_amount",
        "transaction_count",
        "avg_transaction",
        "max_transaction",
        "min_transaction",
        "pct_of_monthly_total",
        "mom_change",
        "mom_change_pct",
        "last_calculated",
    ),
    "cohort_spending": ("total_amount", "occurrences", "avg_amount", "last_calculated"),
    "column_mapping_logs": ("created_at",),
    "daily_summaries": (
        "total_income",
        "total_expenses",
        "net",
        "income_count",
        "expense_count",
        "transfer_count",
        "total_transactions",
        "last_calculated",
    ),
    "financial_goals": (
        "current_amount",
        "progress_pct",
        "monthly_target",
        "on_track",
        "status",
        "created_at",
    ),
    "fy_summaries": (
        "total_income",
        "salary_income",
        "bonus_income",
        "investment_income",
        "other_income",
        "total_expenses",
        "tax_paid",
        "investments_made",
        "net_savings",
        "savings_rate",
        "yoy_income_change",
        "yoy_expense_change",
        "yoy_savings_change",
        "last_calculated",
        "is_complete",
    ),
    "investment_holdings": ("realized_gains", "unrealized_gains", "last_updated", "is_active"),
    "merchant_intelligence": (
        "total_spent",
        "transaction_count",
        "avg_transaction",
        "months_active",
        "avg_days_between",
        "is_recurring",
        "last_calculated",
    ),
    "monthly_summaries": (
        "total_income",
        "salary_income",
        "investment_income",
        "other_income",
        "total_expenses",
        "essential_expenses",
        "discretionary_expenses",
        "total_transfers_out",
        "total_transfers_in",
        "net_investment_flow",
        "net_savings",
        "savings_rate",
        "expense_ratio",
        "income_count",
        "expense_count",
        "transfer_count",
        "total_transactions",
        "income_change_pct",
        "expense_change_pct",
        "last_calculated",
    ),
    "net_worth_snapshots": (
        "cash_and_bank",
        "investments",
        "mutual_funds",
        "stocks",
        "fixed_deposits",
        "ppf_epf",
        "other_assets",
        "credit_card_outstanding",
        "loans_payable",
        "other_liabilities",
        "net_worth_change",
        "net_worth_change_pct",
        "created_at",
        "source",
    ),
    "recurring_transactions": (
        "amount_variance",
        "confidence_score",
        "occurrences_detected",
        "times_missed",
        "is_active",
        "is_user_confirmed",
        "first_detected",
        "last_updated",
    ),
    "transfer_flows": ("total_amount", "transaction_count", "avg_transfer", "last_calculated"),
}
_INDEXES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("anomalies", "ix_anomalies_anomaly_type", ("anomaly_type",)),
    ("audit_logs", "ix_audit_logs_operation", ("operation",)),
    ("budgets", "ix_budgets_category", ("category",)),
    ("category_trends", "ix_category_trends_category", ("category",)),
    ("category_trends", "ix_category_trends_period_key", ("period_key",)),
    ("import_logs", "ix_import_logs_file_hash", ("file_hash",)),
    ("investment_holdings", "ix_investment_holdings_account", ("account",)),
    ("net_worth_snapshots", "ix_net_worth_snapshots_snapshot_date", ("snapshot_date",)),
    ("transfer_flows", "ix_transfer_flows_from_account", ("from_account",)),
    ("transfer_flows", "ix_transfer_flows_to_account", ("to_account",)),
)
# (table, legacy index, retained ORM index, shared columns)
_DUPLICATE_INDEXES: tuple[tuple[str, str, str, tuple[str, ...]], ...] = (
    ("audit_logs", "ix_audit_logs_user_id", "ix_audit_user", ("user_id",)),
    ("budgets", "ix_budget_category", "ix_budgets_category", ("category",)),
    ("fy_summaries", "ix_fy_summary_year", "ix_fy_summaries_fiscal_year", ("fiscal_year",)),
    (
        "investment_holdings",
        "ix_investment_holdings_user_id",
        "ix_investment_user",
        ("user_id",),
    ),
    (
        "merchant_intelligence",
        "ix_merchant_name",
        "ix_merchant_intelligence_merchant_name",
        ("merchant_name",),
    ),
    (
        "monthly_summaries",
        "ix_monthly_summary_period",
        "ix_monthly_summaries_period_key",
        ("period_key",),
    ),
)
_RECOVERY = (
    "No rows or schema were changed. Review a verified backup and resolve the "
    "reported schema or rows explicitly, then rerun the migration."
)


def _plain_index(index: dict, columns: tuple[str, ...]) -> bool:
    # Reflection reports partial predicates, non-btree methods, and included
    # columns as dialect options; any of those makes the index non-equivalent.
    return (
        tuple(index["column_names"]) == columns
        and not index["unique"]
        and not index.get("duplicates_constraint")
        and not index.get("column_sorting")
        and all(
            (option == "postgresql_include" and value == [])
            or (option == "postgresql_using" and value == "btree")
            for option, value in index.get("dialect_options", {}).items()
        )
    )


def _nullable_plan(inspector: sa.Inspector) -> dict[str, list[str]]:
    plan = {}
    for table, columns in _NOT_NULL.items():
        nullable = {column["name"] for column in inspector.get_columns(table) if column["nullable"]}
        pending = [column for column in columns if column in nullable]
        if pending:
            plan[table] = pending
    return plan


def _index_plan(
    inspector: sa.Inspector,
) -> tuple[list[tuple[str, str, tuple[str, ...]]], list[tuple[str, str]]]:
    indexes = {
        table: {index["name"]: index for index in inspector.get_indexes(table)}
        for table in {entry[0] for entry in (*_INDEXES, *_DUPLICATE_INDEXES)}
    }
    creates = []
    for table, name, columns in _INDEXES:
        current = indexes[table].get(name)
        if current is None:
            creates.append((table, name, columns))
        elif not _plain_index(current, columns):
            raise RuntimeError(
                f"Index {table}.{name} exists but is not a plain index on {list(columns)}. "
                f"{_RECOVERY}"
            )
    planned = {(table, name) for table, name, _columns in creates}
    drops = []
    for table, legacy, retained, columns in _DUPLICATE_INDEXES:
        current = indexes[table].get(legacy)
        if current is None:
            continue
        kept = indexes[table].get(retained)
        if not _plain_index(current, columns) or (
            (table, retained) not in planned and (kept is None or not _plain_index(kept, columns))
        ):
            raise RuntimeError(
                f"Cannot remove {table}.{legacy}: it does not duplicate retained index "
                f"{retained} on {list(columns)}. {_RECOVERY}"
            )
        drops.append((table, legacy))
    return creates, drops


def _prepare(bind: sa.Connection, tables: list[str], rebuilds: bool) -> None:
    if bind.dialect.name == "postgresql":
        bind.exec_driver_sql(f"SET LOCAL lock_timeout = '{_LOCK_TIMEOUT}'")
        # users first: application writers lock the owning user row before
        # touching analytics or ledger tables, so this matches their lock order.
        ordered = sorted(tables, key=lambda name: (name != "users", name))
        bind.exec_driver_sql(f"LOCK TABLE {', '.join(ordered)} IN ACCESS EXCLUSIVE MODE")
    elif bind.dialect.name == "sqlite":
        if rebuilds and bind.exec_driver_sql("PRAGMA foreign_keys").scalar_one():
            raise RuntimeError(
                "ORM schema alignment requires a dedicated SQLite connection with "
                "PRAGMA foreign_keys=OFF before beginning the migration transaction, to "
                "preserve child rows during parent-table rebuilds. Re-enable it after "
                "commit. No rows or schema were changed."
            )
        if not bind.connection.driver_connection.in_transaction:
            bind.exec_driver_sql("BEGIN IMMEDIATE")
        else:
            # Upgrade a deferred read transaction to a writer without changing rows.
            bind.exec_driver_sql("UPDATE users SET id=id WHERE 1=0")
    else:
        raise RuntimeError("ORM schema alignment supports SQLite and PostgreSQL only.")


def _reject_nulls(bind: sa.Connection, plan: dict[str, list[str]]) -> None:
    problems = []
    for table, columns in plan.items():
        source = sa.table(table, *(sa.column(name) for name in columns))
        counts = bind.execute(
            sa.select(
                *(sa.func.sum(sa.case((source.c[name].is_(None), 1), else_=0)) for name in columns)
            )
        ).one()
        problems.extend(
            f"{table}.{name} ({count} rows)"
            for name, count in zip(columns, counts, strict=True)
            if count
        )
    if problems:
        raise RuntimeError(
            f"Cannot enforce NOT NULL; NULL values exist in {', '.join(problems)}. "
            "Nothing is backfilled or deleted automatically. "
            f"{_RECOVERY}"
        )


def _check_sqlite_foreign_keys(bind: sa.Connection) -> None:
    if bind.dialect.name != "sqlite":
        return
    violations = bind.exec_driver_sql("PRAGMA foreign_key_check").fetchmany(5)
    if violations:
        raise RuntimeError(
            f"Foreign key validation failed during ORM schema alignment: {violations}. "
            "Roll back the migration transaction and resolve the reported references "
            "from a verified backup; no automatic data repair is performed."
        )


def upgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError("ORM schema alignment requires an online schema and data preflight.")
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    nullable = _nullable_plan(inspector)
    creates, drops = _index_plan(inspector)
    tables = sorted({*nullable, *(entry[0] for entry in creates), *(entry[0] for entry in drops)})
    if not tables:
        return
    _prepare(bind, tables, rebuilds=bool(nullable))
    _reject_nulls(bind, nullable)
    for table, columns in nullable.items():
        with op.batch_alter_table(table) as batch:
            for column in columns:
                batch.alter_column(column, nullable=False)
    for table, name, columns in creates:
        op.create_index(name, table, list(columns), unique=False)
    for table, name in drops:
        op.drop_index(name, table_name=table)
    _check_sqlite_foreign_keys(bind)


@irreversible
def downgrade() -> None:
    """Relaxing constraints the ORM requires needs a verified backup or forward repair."""

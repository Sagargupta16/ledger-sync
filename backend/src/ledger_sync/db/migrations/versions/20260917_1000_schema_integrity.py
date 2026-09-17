"""Enforce user-scoped business keys and transaction ownership without data repair.

Revision ID: schema_integrity_2026
Revises: identity_constraints_2026
Create Date: 2026-09-17 10:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

from ledger_sync.db.migrations.safety import irreversible

revision: str = "schema_integrity_2026"
down_revision: str | None = "identity_constraints_2026"
branch_labels: str | None = None
depends_on: str | None = None

_BUSINESS_KEYS = {
    "budgets": ("user_id", "category", "subcategory"),
    "import_logs": ("user_id", "file_hash"),
    "fy_summaries": ("user_id", "fiscal_year"),
    "category_trends": (
        "user_id",
        "period_key",
        "category",
        "subcategory",
        "transaction_type",
    ),
    # This is the extractor's actual identity. Descriptor case is significant,
    # and a descriptor can have the same name as a recognized brand.
    "merchant_intelligence": ("user_id", "merchant_name", "label_kind"),
}
_TRANSACTION_CHILDREN = ("transaction_tags", "anomalies")
_DUPLICATE_INDEXES = (
    ("anomalies", "ix_anomaly_user", "ix_anomalies_user_id", ["user_id"]),
    ("audit_logs", "ix_audit_created", "ix_audit_logs_created_at", ["created_at"]),
    ("category_trends", "ix_category_trend_user", "ix_category_trends_user_id", ["user_id"]),
    (
        "recurring_transactions",
        "ix_recurring_user",
        "ix_recurring_transactions_user_id",
        ["user_id"],
    ),
)
_FK_NAMING = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}
_RECOVERY = (
    "No records were changed or deleted. Review these row IDs in a verified backup, "
    "resolve duplicates or ownership explicitly with the owner, then rerun the migration."
)


def _lock_writers(bind: sa.Connection) -> None:
    if bind.dialect.name == "postgresql":
        # Validation and all DDL share a transaction; block concurrent writers so
        # preflight cannot pass against a moving set of business keys or owners.
        bind.exec_driver_sql(
            "LOCK TABLE users, transactions, transaction_tags, anomalies, budgets, "
            "import_logs, fy_summaries, category_trends, merchant_intelligence, "
            "audit_logs, recurring_transactions, net_worth_snapshots "
            "IN SHARE ROW EXCLUSIVE MODE"
        )
    elif bind.dialect.name == "sqlite":
        # sqlite3 legacy transaction control otherwise autocommits initial DDL.
        # Never commit the caller's transaction or disable foreign-key checking.
        if not bind.connection.driver_connection.in_transaction:
            bind.exec_driver_sql("BEGIN IMMEDIATE")
        else:
            # Acquire a write reservation even if the caller began a deferred
            # read transaction. The false predicate ensures no row is updated.
            bind.exec_driver_sql("UPDATE budgets SET id=id WHERE 1=0")
    else:
        raise RuntimeError("Schema integrity migration supports SQLite and PostgreSQL only.")


def _validate_existing_data(bind: sa.Connection) -> None:
    for table, columns in _BUSINESS_KEYS.items():
        duplicates = (
            bind.execute(
                sa.text(
                    f"SELECT MIN(id) AS first_id, MAX(id) AS last_id, COUNT(*) AS row_count "
                    f"FROM {table} GROUP BY {', '.join(columns)} HAVING COUNT(*) > 1 LIMIT 5"
                )
            )
            .mappings()
            .all()
        )
        if duplicates:
            examples = ", ".join(
                f"IDs {row['first_id']} and {row['last_id']} ({row['row_count']} rows)"
                for row in duplicates
            )
            raise RuntimeError(
                f"Duplicate {table} key ({', '.join(columns)}): {examples}. {_RECOVERY}"
            )

    for table in _TRANSACTION_CHILDREN:
        invalid = (
            bind.execute(
                sa.text(
                    f"SELECT child.id FROM {table} AS child "
                    "LEFT JOIN transactions AS parent "
                    "ON child.transaction_id = parent.transaction_id "
                    "AND child.user_id = parent.user_id "
                    "WHERE child.transaction_id IS NOT NULL AND parent.transaction_id IS NULL "
                    "ORDER BY child.id LIMIT 5"
                )
            )
            .scalars()
            .all()
        )
        if invalid:
            raise RuntimeError(
                f"Invalid {table} transaction ownership or missing transaction at row IDs "
                f"{invalid}. Expected (user_id, transaction_id) to match transactions. {_RECOVERY}"
            )

    # SQLite databases may have been written by tools with FK checking disabled.
    # Also reject ownerless aggregate/child rows before any table is rebuilt.
    for table in (*_BUSINESS_KEYS, *_TRANSACTION_CHILDREN, "transactions"):
        invalid = (
            bind.execute(
                sa.text(
                    f"SELECT child.user_id FROM {table} AS child "
                    "LEFT JOIN users AS owner ON child.user_id = owner.id "
                    "WHERE owner.id IS NULL LIMIT 5"
                )
            )
            .scalars()
            .all()
        )
        if invalid:
            raise RuntimeError(
                f"Invalid {table} user ownership: user IDs {invalid} do not exist. {_RECOVERY}"
            )


def _plain_index(index: dict, columns: list[str]) -> bool:
    return (
        index["column_names"] == columns
        and not index["unique"]
        and not index.get("duplicates_constraint")
        and not index.get("column_sorting")
        and all(
            (option == "postgresql_include" and value == [])
            or (option == "postgresql_using" and value == "btree")
            for option, value in index.get("dialect_options", {}).items()
        )
    )


def _validate_index_cleanup(bind: sa.Connection) -> None:
    inspector = sa.inspect(bind)
    for table, remove, keep, columns in _DUPLICATE_INDEXES:
        indexes = {index["name"]: index for index in inspector.get_indexes(table)}
        if remove not in indexes:
            continue
        if not _plain_index(indexes[remove], columns) or (
            keep in indexes and not _plain_index(indexes[keep], columns)
        ):
            raise RuntimeError(
                f"Cannot safely remove {table}.{remove}: it does not match retained index {keep}. "
                "No schema changes were made. Inspect index definitions before rerunning."
            )

    indexes = {index["name"]: index for index in inspector.get_indexes("net_worth_snapshots")}
    redundant = indexes.get("ix_net_worth_user_date")
    if redundant is None:
        return
    columns = ["user_id", "snapshot_date"]
    unique_keys = inspector.get_unique_constraints("net_worth_snapshots")
    if not _plain_index(redundant, columns) or not any(
        key["column_names"] == columns for key in unique_keys
    ):
        raise RuntimeError(
            "Cannot safely remove ix_net_worth_user_date: expected matching "
            "net_worth_snapshots(user_id, snapshot_date) unique constraint is missing. "
            "No schema changes were made. Inspect index definitions before rerunning."
        )


def _add_business_keys() -> None:
    with op.batch_alter_table("budgets") as batch:
        batch.drop_constraint("uq_budget_user_category", type_="unique")
        batch.create_index(
            "uq_budget_user_category_null",
            ["user_id", "category"],
            unique=True,
            sqlite_where=sa.text("subcategory IS NULL"),
            postgresql_where=sa.text("subcategory IS NULL"),
        )
        batch.create_index(
            "uq_budget_user_category_subcategory",
            ["user_id", "category", "subcategory"],
            unique=True,
            sqlite_where=sa.text("subcategory IS NOT NULL"),
            postgresql_where=sa.text("subcategory IS NOT NULL"),
        )

    for name, table, columns in (
        ("uq_import_logs_user_file_hash", "import_logs", ["user_id", "file_hash"]),
        ("uq_fy_summaries_user_fiscal_year", "fy_summaries", ["user_id", "fiscal_year"]),
        (
            "uq_merchant_intelligence_user_label",
            "merchant_intelligence",
            ["user_id", "merchant_name", "label_kind"],
        ),
    ):
        op.create_index(name, table, columns, unique=True)

    op.create_index(
        "uq_category_trends_user_scope_null",
        "category_trends",
        ["user_id", "period_key", "category", "transaction_type"],
        unique=True,
        sqlite_where=sa.text("subcategory IS NULL"),
        postgresql_where=sa.text("subcategory IS NULL"),
    )
    op.create_index(
        "uq_category_trends_user_scope_subcategory",
        "category_trends",
        ["user_id", "period_key", "category", "subcategory", "transaction_type"],
        unique=True,
        sqlite_where=sa.text("subcategory IS NOT NULL"),
        postgresql_where=sa.text("subcategory IS NOT NULL"),
    )


def _qualify_transaction_ownership(bind: sa.Connection) -> None:
    # An unconditional unique index is FK-compatible on both engines. Unlike
    # adding a SQLite UNIQUE constraint, it does not rebuild the parent table
    # and accidentally cascade deletion to existing tags/anomalies.
    op.create_index(
        "uq_transactions_user_id",
        "transactions",
        ["user_id", "transaction_id"],
        unique=True,
    )
    for table in _TRANSACTION_CHILDREN:
        old_keys = [
            key
            for key in sa.inspect(bind).get_foreign_keys(table)
            if key["referred_table"] == "transactions"
            and key["constrained_columns"] == ["transaction_id"]
        ]
        with op.batch_alter_table(table, naming_convention=_FK_NAMING) as batch:
            for key in old_keys:
                batch.drop_constraint(
                    key["name"] or f"fk_{table}_transaction_id_transactions",
                    type_="foreignkey",
                )
            batch.create_foreign_key(
                f"fk_{table}_user_transaction",
                "transactions",
                ["user_id", "transaction_id"],
                ["user_id", "transaction_id"],
                ondelete="CASCADE",
            )


def _remove_duplicate_indexes(bind: sa.Connection) -> None:
    for table, remove, keep, columns in _DUPLICATE_INDEXES:
        indexes = {index["name"] for index in sa.inspect(bind).get_indexes(table)}
        if remove in indexes:
            # Historical migrations sometimes created only the explicit index;
            # create_all-based installations also have the column-level index.
            if keep not in indexes:
                op.create_index(keep, table, columns, unique=False)
            op.drop_index(remove, table_name=table)
    if "ix_net_worth_user_date" in {
        index["name"] for index in sa.inspect(bind).get_indexes("net_worth_snapshots")
    }:
        op.drop_index("ix_net_worth_user_date", table_name="net_worth_snapshots")


def upgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError(
            "Schema integrity requires an online connection for duplicate and ownership preflight."
        )
    bind = op.get_bind()
    _lock_writers(bind)
    _validate_existing_data(bind)
    _validate_index_cleanup(bind)
    _add_business_keys()
    _qualify_transaction_ownership(bind)
    _remove_duplicate_indexes(bind)


@irreversible
def downgrade() -> None:
    """Recover from backup or forward repair instead of weakening ownership guarantees."""

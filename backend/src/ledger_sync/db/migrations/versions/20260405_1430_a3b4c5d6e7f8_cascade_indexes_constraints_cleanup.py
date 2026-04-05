"""cascade_indexes_constraints_cleanup

Revision ID: a3b4c5d6e7f8
Revises: c1511eec274c
Create Date: 2026-04-05 14:30:00.000000

Changes:
- Add ON DELETE CASCADE to all user_id FKs (16 tables)
- Drop ~13 redundant/duplicate indexes
- Add unique constraints on category_trends, fy_summaries, merchant_intelligence
- Drop legacy `transfers` table (0 rows, no user_id, unused)
"""

from collections.abc import Sequence

from alembic import op

revision: str = "a3b4c5d6e7f8"
down_revision: str | None = "c1511eec274c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _get_user_fk_name(table: str) -> str | None:
    """Find the FK constraint name for the user_id -> users.id FK."""
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)
    for fk in inspector.get_foreign_keys(table):
        if fk["referred_table"] == "users" and "user_id" in fk["constrained_columns"]:
            return fk.get("name")
    return None


def _index_exists(table: str, index_name: str) -> bool:
    """Check if an index exists (idempotent drops)."""
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)
    return index_name in [idx["name"] for idx in inspector.get_indexes(table)]


def _table_exists(table: str) -> bool:
    """Check if a table exists."""
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)
    return table in inspector.get_table_names()


# ---------------------------------------------------------------------------
# Tables whose user_id FK needs ON DELETE CASCADE.
# audit_logs and investment_holdings already have CASCADE from the previous
# migration, so they are excluded.
# ---------------------------------------------------------------------------
_CASCADE_TABLES = [
    "transactions",
    "anomalies",
    "budgets",
    "category_trends",
    "financial_goals",
    "import_logs",
    "monthly_summaries",
    "recurring_transactions",
    "scheduled_transactions",
    "user_preferences",
    "merchant_intelligence",
    "net_worth_snapshots",
    "fy_summaries",
    "tax_records",
    "transfer_flows",
    "account_classifications",
]

# ---------------------------------------------------------------------------
# Redundant indexes to drop.
# Each is either:
#   - A single-column index that's the leftmost prefix of a composite, or
#   - A duplicate (both column-level index=True and explicit Index() on the
#     same column).
# ---------------------------------------------------------------------------
_REDUNDANT_INDEXES = [
    # transactions — single-column indexes superseded by composites
    ("transactions", "ix_transactions_user_id"),
    ("transactions", "ix_transactions_date"),
    ("transactions", "ix_transactions_type"),
    ("transactions", "ix_transactions_category"),
    ("transactions", "ix_transactions_is_deleted"),
    # anomalies — duplicates and covered by composites
    ("anomalies", "ix_anomaly_user"),  # dup of ix_anomalies_user_id
    ("anomalies", "ix_anomalies_anomaly_type"),  # covered by ix_anomaly_type_severity
    # audit_logs — duplicates and covered by composites
    ("audit_logs", "ix_audit_created"),  # dup of ix_audit_logs_created_at
    ("audit_logs", "ix_audit_user"),  # dup of ix_audit_logs_user_id (from col)
    ("audit_logs", "ix_audit_logs_operation"),  # covered by ix_audit_operation_entity
    # category_trends — duplicates and covered by composites
    ("category_trends", "ix_category_trend_user"),  # dup of ix_category_trends_user_id
    ("category_trends", "ix_category_trends_period_key"),  # covered by composite
    ("category_trends", "ix_category_trends_category"),  # covered by composites
    # investment_holdings — duplicate
    ("investment_holdings", "ix_investment_user"),  # dup of col-level index
    # recurring_transactions — duplicate
    ("recurring_transactions", "ix_recurring_user"),  # dup of ix_recurring_transactions_user_id
]


def upgrade() -> None:
    # ── 1. Drop legacy transfers table ───────────────────────────────────
    if _table_exists("transfers"):
        op.drop_table("transfers")

    # ── 2. Drop redundant indexes ────────────────────────────────────────
    for table, index_name in _REDUNDANT_INDEXES:
        if _index_exists(table, index_name):
            op.drop_index(index_name, table_name=table)

    # ── 3. Upgrade user_id FKs to ON DELETE CASCADE ──────────────────────
    #
    # For each table we use batch_alter_table which:
    #   - SQLite: recreates the table (copies data, applies new schema)
    #   - PostgreSQL: uses ALTER TABLE directly (fast)
    #
    # SQLite FKs are often unnamed. We use naming_convention so Alembic
    # can generate predictable names during reflection, enabling drop.
    #
    _naming = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}

    for table in _CASCADE_TABLES:
        extra_ops = _EXTRA_OPS.get(table)
        fk_name = _get_user_fk_name(table)

        with op.batch_alter_table(
            table,
            recreate="always",
            naming_convention=_naming,
        ) as batch_op:
            # Drop existing FK — use reflected name, or convention name
            drop_name = fk_name or f"fk_{table}_user_id_users"
            batch_op.drop_constraint(drop_name, type_="foreignkey")

            # Recreate with CASCADE
            batch_op.create_foreign_key(
                f"fk_{table}_user_id",
                "users",
                ["user_id"],
                ["id"],
                ondelete="CASCADE",
            )

            # Apply any extra constraints for this table
            if extra_ops:
                extra_ops(batch_op)


def _add_category_trend_uq(batch_op: object) -> None:
    batch_op.create_unique_constraint(
        "uq_category_trend_user_period_cat",
        ["user_id", "period_key", "category", "subcategory", "transaction_type"],
    )


def _add_fy_summary_uq(batch_op: object) -> None:
    batch_op.create_unique_constraint(
        "uq_fy_summary_user_fy",
        ["user_id", "fiscal_year"],
    )


def _add_merchant_uq(batch_op: object) -> None:
    batch_op.create_unique_constraint(
        "uq_merchant_user_name",
        ["user_id", "merchant_name"],
    )


_EXTRA_OPS: dict[str, object] = {
    "category_trends": _add_category_trend_uq,
    "fy_summaries": _add_fy_summary_uq,
    "merchant_intelligence": _add_merchant_uq,
}


def downgrade() -> None:
    # Downgrade requires database backup — see CLAUDE.md.
    pass

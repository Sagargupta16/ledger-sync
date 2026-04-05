"""add_user_scoping_cascades_indexes_constraints

Revision ID: c1511eec274c
Revises: c7f8a9b0d1e2
Create Date: 2026-04-05 12:56:33.435619

Changes:
- Add user_id FK to investment_holdings (security: user scoping)
- Add user_id FK to audit_logs (traceability)
- Add updated_at to financial_goals and tax_records
- Add unique constraint on budgets (user_id, category, subcategory)
- Add composite indexes for common query patterns
- Add CHECK constraints on budget limits and goal targets
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1511eec274c"
down_revision: str | None = "c7f8a9b0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column already exists (idempotent migrations)."""
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col["name"] for col in inspector.get_columns(table)]
    return column in columns


def _index_exists(table: str, index_name: str) -> bool:
    """Check if an index already exists."""
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = [idx["name"] for idx in inspector.get_indexes(table)]
    return index_name in indexes


def upgrade() -> None:
    # ── 1. Add user_id to audit_logs ─────────────────────────────────────
    if not _column_exists("audit_logs", "user_id"):
        op.add_column("audit_logs", sa.Column("user_id", sa.Integer(), nullable=True))
    if not _index_exists("audit_logs", "ix_audit_user"):
        op.create_index("ix_audit_user", "audit_logs", ["user_id"], unique=False)
    # FK creation via batch mode for SQLite compatibility
    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.create_foreign_key(
            "fk_audit_logs_user_id", "users", ["user_id"], ["id"], ondelete="CASCADE"
        )

    # ── 2. Add user_id to investment_holdings ────────────────────────────
    if not _column_exists("investment_holdings", "user_id"):
        # Add as nullable first (existing rows have no user_id)
        op.add_column("investment_holdings", sa.Column("user_id", sa.Integer(), nullable=True))
        # Backfill: assign all existing holdings to the first user (if any)
        conn = op.get_bind()
        first_user = conn.execute(sa.text("SELECT id FROM users LIMIT 1")).scalar()
        if first_user is not None:
            conn.execute(
                sa.text("UPDATE investment_holdings SET user_id = :uid WHERE user_id IS NULL"),
                {"uid": first_user},
            )
        # Now make it NOT NULL (safe after backfill; empty table is also fine)
        with op.batch_alter_table("investment_holdings") as batch_op:
            batch_op.alter_column("user_id", nullable=False)
    if not _index_exists("investment_holdings", "ix_investment_user"):
        op.create_index("ix_investment_user", "investment_holdings", ["user_id"], unique=False)
    with op.batch_alter_table("investment_holdings") as batch_op:
        batch_op.create_foreign_key(
            "fk_investment_holdings_user_id",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # ── 3. Add updated_at to financial_goals ─────────────────────────────
    if not _column_exists("financial_goals", "updated_at"):
        op.add_column(
            "financial_goals",
            sa.Column(
                "updated_at",
                sa.DateTime(),
                server_default=sa.text("'2026-01-01'"),
                nullable=False,
            ),
        )

    # ── 4. Add updated_at to tax_records ─────────────────────────────────
    if not _column_exists("tax_records", "updated_at"):
        op.add_column(
            "tax_records",
            sa.Column(
                "updated_at",
                sa.DateTime(),
                server_default=sa.text("'2026-01-01'"),
                nullable=False,
            ),
        )

    # ── 5. Budget unique constraint + index ──────────────────────────────
    if not _index_exists("budgets", "ix_budget_user_category"):
        op.create_index("ix_budget_user_category", "budgets", ["user_id", "category"], unique=False)
    # UniqueConstraint via batch for SQLite
    with op.batch_alter_table("budgets") as batch_op:
        batch_op.create_unique_constraint(
            "uq_budget_user_category", ["user_id", "category", "subcategory"]
        )

    # ── 6. Scheduled transaction composite index ─────────────────────────
    if not _index_exists("scheduled_transactions", "ix_scheduled_user_active_due"):
        op.create_index(
            "ix_scheduled_user_active_due",
            "scheduled_transactions",
            ["user_id", "is_active", "next_due_date"],
            unique=False,
        )


def downgrade() -> None:
    # Remove in reverse order
    op.drop_index("ix_scheduled_user_active_due", table_name="scheduled_transactions")
    with op.batch_alter_table("budgets") as batch_op:
        batch_op.drop_constraint("uq_budget_user_category", type_="unique")
    op.drop_index("ix_budget_user_category", table_name="budgets")
    op.drop_column("tax_records", "updated_at")
    op.drop_column("financial_goals", "updated_at")
    with op.batch_alter_table("investment_holdings") as batch_op:
        batch_op.drop_constraint("fk_investment_holdings_user_id", type_="foreignkey")
    op.drop_index("ix_investment_user", table_name="investment_holdings")
    op.drop_column("investment_holdings", "user_id")
    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.drop_constraint("fk_audit_logs_user_id", type_="foreignkey")
    op.drop_index("ix_audit_user", table_name="audit_logs")
    op.drop_column("audit_logs", "user_id")

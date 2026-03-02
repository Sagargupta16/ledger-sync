"""Fix missing columns from failed af63e055055a migration on PostgreSQL.

Migration af63e055055a added NOT NULL columns to existing tables without
server_default, which fails on PostgreSQL when the table already has rows.
The render.yaml build command stamps the migration as applied on failure,
so the columns are never created. This migration adds them idempotently.

Revision ID: c7f8a9b0d1e2
Revises: b1c2d3e4f5a6
Create Date: 2026-03-02 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7f8a9b0d1e2"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column exists in a table."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    return column in [c["name"] for c in inspector.get_columns(table)]


def upgrade() -> None:
    # --- transactions: created_at, updated_at ---
    if not _column_exists("transactions", "created_at"):
        # Add as nullable first, backfill, then set NOT NULL
        op.add_column(
            "transactions",
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("now()")),
        )
        op.execute("UPDATE transactions SET created_at = now() WHERE created_at IS NULL")
        op.alter_column("transactions", "created_at", nullable=False)

    if not _column_exists("transactions", "updated_at"):
        op.add_column(
            "transactions",
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("now()")),
        )
        op.execute("UPDATE transactions SET updated_at = now() WHERE updated_at IS NULL")
        op.alter_column("transactions", "updated_at", nullable=False)

    # --- tax_records: user_id (may be missing if af63e055055a failed) ---
    if not _column_exists("tax_records", "user_id"):
        # Add nullable first, then set NOT NULL after backfill
        op.add_column(
            "tax_records",
            sa.Column("user_id", sa.Integer(), nullable=True),
        )
        # Assign to the first user if any rows exist (tax_records were not user-scoped before)
        conn = op.get_bind()
        result = conn.execute(sa.text("SELECT id FROM users LIMIT 1"))
        row = result.fetchone()
        if row:
            op.execute(f"UPDATE tax_records SET user_id = {row[0]} WHERE user_id IS NULL")
        op.alter_column("tax_records", "user_id", nullable=False)
        op.create_foreign_key(None, "tax_records", "users", ["user_id"], ["id"])


def downgrade() -> None:
    # These are fixes for production — downgrading would break things further
    pass

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

from ledger_sync.db.migrations.safety import irreversible

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
    conn = op.get_bind()
    for column in ("created_at", "updated_at"):
        if not _column_exists("transactions", column):
            op.add_column("transactions", sa.Column(column, sa.DateTime(), nullable=True))
            conn.execute(
                sa.text(
                    f"UPDATE transactions SET {column} = CURRENT_TIMESTAMP WHERE {column} IS NULL"
                )
            )
            with op.batch_alter_table("transactions") as batch_op:
                batch_op.alter_column(
                    column,
                    existing_type=sa.DateTime(),
                    nullable=False,
                    server_default=sa.func.current_timestamp(),
                )

    # --- tax_records: user_id (may be missing if af63e055055a failed) ---
    if not _column_exists("tax_records", "user_id"):
        owners = conn.execute(sa.text("SELECT id FROM users ORDER BY id LIMIT 2")).scalars().all()
        has_tax_records = conn.execute(sa.text("SELECT 1 FROM tax_records LIMIT 1")).first()
        if has_tax_records is not None and len(owners) != 1:
            raise RuntimeError(
                "Legacy tax records need an explicitly identified owner before this migration."
            )
        # Add nullable first, then set NOT NULL after backfill
        op.add_column(
            "tax_records",
            sa.Column("user_id", sa.Integer(), nullable=True),
        )
        if has_tax_records is not None:
            conn.execute(
                sa.text("UPDATE tax_records SET user_id = :uid WHERE user_id IS NULL"),
                {"uid": owners[0]},
            )
        with op.batch_alter_table("tax_records") as batch_op:
            batch_op.alter_column("user_id", existing_type=sa.Integer(), nullable=False)
            batch_op.create_foreign_key("fk_tax_records_user_id", "users", ["user_id"], ["id"])


@irreversible
def downgrade() -> None:
    # These are fixes for production — downgrading would break things further
    pass

"""Track analytics input and published generations without touching ledger rows.

Revision ID: analytics_versions_2026
Revises: stable_import_identity_2026
Create Date: 2026-09-17 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision: str = "analytics_versions_2026"
down_revision: str | None = "stable_import_identity_2026"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # init_db/create_all can precede migrations in existing installations.
    if sa.inspect(op.get_bind()).has_table("analytics_state"):
        return
    op.create_table(
        "analytics_state",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("ledger_version", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("preferences_version", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("algorithm_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("published_ledger_version", sa.BigInteger(), nullable=False, server_default="-1"),
        sa.Column(
            "published_preferences_version", sa.BigInteger(), nullable=False, server_default="-1"
        ),
        sa.Column("published_algorithm_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("full_rebuild_required", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("dirty_dates", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    # No eager per-user backfill: absence is stale and first refresh builds all domains.


def downgrade() -> None:
    op.drop_table("analytics_state")

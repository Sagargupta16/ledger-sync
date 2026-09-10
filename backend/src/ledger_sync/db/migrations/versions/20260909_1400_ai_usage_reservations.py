"""Add atomic AI usage reservations and credential funding metadata.

Revision ID: ai_usage_reservations_2026
Revises: reconcile_create_all_2026
Create Date: 2026-09-09 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "ai_usage_reservations_2026"
down_revision: str | None = "reconcile_create_all_2026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("ai_usage_log") as batch:
        batch.add_column(
            sa.Column("funding_source", sa.String(16), nullable=False, server_default="legacy")
        )
        batch.add_column(
            sa.Column("status", sa.String(16), nullable=False, server_default="completed")
        )
        batch.add_column(
            sa.Column("reserved_tokens", sa.Integer(), nullable=False, server_default="0")
        )
        batch.create_check_constraint(
            "ck_ai_usage_funding_source", "funding_source IN ('app', 'personal', 'legacy')"
        )
        batch.create_check_constraint(
            "ck_ai_usage_status", "status IN ('reserved', 'completed', 'failed')"
        )
        batch.create_check_constraint("ck_ai_usage_reserved_tokens", "reserved_tokens >= 0")

    # Historical Bedrock rows did not record who paid. Keep them distinct and
    # conservatively include them in the shared cap until that UTC day ends.
    usage = sa.table("ai_usage_log", sa.column("provider"), sa.column("funding_source"))
    op.execute(
        usage.update().where(usage.c.provider != "bedrock").values(funding_source="personal")
    )


def downgrade() -> None:
    with op.batch_alter_table("ai_usage_log") as batch:
        batch.drop_constraint("ck_ai_usage_reserved_tokens", type_="check")
        batch.drop_constraint("ck_ai_usage_status", type_="check")
        batch.drop_constraint("ck_ai_usage_funding_source", type_="check")
        batch.drop_column("reserved_tokens")
        batch.drop_column("status")
        batch.drop_column("funding_source")

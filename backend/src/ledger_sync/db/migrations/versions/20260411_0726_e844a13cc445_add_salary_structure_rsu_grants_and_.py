"""add salary structure, RSU grants, and growth assumptions

Revision ID: e844a13cc445
Revises: e4f5a6b7c8d9
Create Date: 2026-04-11 07:26:41.139729

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e844a13cc445"
down_revision: str | None = "e4f5a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("salary_structure", sa.Text(), nullable=False, server_default="{}"),
    )
    op.add_column(
        "user_preferences", sa.Column("rsu_grants", sa.Text(), nullable=False, server_default="[]")
    )
    op.add_column(
        "user_preferences",
        sa.Column("growth_assumptions", sa.Text(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    # Rollback requires a database backup (project convention post-2026-02-03)
    pass

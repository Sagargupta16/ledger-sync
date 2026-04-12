"""add missing recurrencefrequency enum values

The original migration created the PostgreSQL enum with only
DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, YEARLY.
The Python enum (and analytics engine) also uses BIMONTHLY and
SEMIANNUAL, which causes INSERT failures on PostgreSQL.

PostgreSQL 12+ allows ALTER TYPE ... ADD VALUE IF NOT EXISTS
inside a transaction, so this is safe on Neon (PostgreSQL 17).

Revision ID: f1a2b3c4d5e6
Revises: e844a13cc445
Create Date: 2026-04-12 12:00:00.000000

"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "e844a13cc445"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # Skip on SQLite (no enum types)
    if conn.dialect.name == "sqlite":
        return

    # Add missing values — IF NOT EXISTS prevents errors if already present
    conn.execute(text("ALTER TYPE recurrencefrequency ADD VALUE IF NOT EXISTS 'BIMONTHLY'"))
    conn.execute(text("ALTER TYPE recurrencefrequency ADD VALUE IF NOT EXISTS 'SEMIANNUAL'"))


def downgrade() -> None:
    pass

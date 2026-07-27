"""add label_kind to merchant_intelligence

Revision ID: merchant_label_kind_2026
Revises: closed_accounts_2026
Create Date: 2026-07-26 10:00:00.000000

Merchant extraction now distinguishes a recognised BRAND ("Netflix", "Uber")
from a DESCRIPTOR -- the transaction note itself, kept whole because the old
first-word heuristic merged unrelated purchases ("Fruits", "Milk", "Flight")
and mis-attributed food rows to technology companies.

``label_kind`` lets consumers separate the two, so a "top merchants" chart
never presents "Juice - Pineapple" as a payee.

server_default='descriptor' backfills existing rows conservatively; the next
analytics refresh recomputes the correct value for every row.

Follows the repo convention of an empty ``downgrade()`` (restore from a
database backup to roll back).
"""

import sqlalchemy as sa
from alembic import op

revision: str = "merchant_label_kind_2026"
down_revision: str | None = "closed_accounts_2026"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "merchant_intelligence",
        sa.Column(
            "label_kind",
            sa.String(length=16),
            nullable=False,
            server_default="descriptor",
        ),
    )


def downgrade() -> None:
    """No downgrade -- restore from a database backup."""

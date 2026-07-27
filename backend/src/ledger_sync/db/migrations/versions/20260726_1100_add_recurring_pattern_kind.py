"""add pattern_kind to recurring_transactions

Revision ID: recurring_pattern_kind_2026
Revises: merchant_label_kind_2026
Create Date: 2026-07-26 11:00:00.000000

Recurrence detection scores gap regularity, which cannot separate a bill from a
habit -- a daily lunch repeats as reliably as rent does. On a real 6,830-row
ledger the note-keyed grouping produced 77 patterns, and roughly half were meals
("Egg Fried Rice" 45 occurrences, "Milk Shake - Banana" 117) sitting alongside
salary and rent in the same list.

``pattern_kind`` splits them: ``commitment`` (anchored to a day of the month,
once per period) versus ``habit`` (periodic but discretionary). Only commitments
belong in fixed-cost totals, the bill calendar, and missed-payment alerts.

server_default='commitment' preserves what consumers saw before this column
existed; the next analytics refresh recomputes the correct value for every
unconfirmed row.

Follows the repo convention of an empty ``downgrade()`` (restore from a
database backup to roll back).
"""

import sqlalchemy as sa
from alembic import op

revision: str = "recurring_pattern_kind_2026"
down_revision: str | None = "merchant_label_kind_2026"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "recurring_transactions",
        sa.Column(
            "pattern_kind",
            sa.String(length=16),
            nullable=False,
            server_default="commitment",
        ),
    )


def downgrade() -> None:
    """No downgrade -- restore from a database backup."""

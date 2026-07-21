"""add is_closed + closed_date to account_classifications

Revision ID: closed_accounts_2026
Revises: account_case_fold_2026
Create Date: 2026-07-21 10:00:00.000000

Closed accounts (a credit card the user cancelled, an old bank account)
keep their transaction history in analytics, but the app stops treating
them as alive: recurring/bill expectations are suppressed, credit-card
limit config is hidden, and account pickers omit them. ``closed_date``
is informational.

server_default='false' backfills existing rows as open; the ORM default
covers new rows.

Follows the repo convention of an empty ``downgrade()`` (restore from a
database backup to roll back).
"""

import sqlalchemy as sa
from alembic import op

revision: str = "closed_accounts_2026"
down_revision: str | None = "account_case_fold_2026"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "account_classifications",
        sa.Column("is_closed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "account_classifications",
        sa.Column("closed_date", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    """No downgrade -- restore from a database backup."""

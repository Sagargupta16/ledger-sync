"""add capital-loss classification preference and monthly rollup bucket

Revision ID: capital_loss_categories_2026
Revises: rollup_split_backfill_2026
Create Date: 2026-07-27 12:00:00.000000

A cashbook has to book a realised trading loss as an ``EXPENSE`` row for the
cash column to balance, but a loss bought no goods or services -- it is a
negative investment return. Nothing sat between ``txn.type == EXPENSE`` and
``total_expenses += amount``, so those rows inflated expense totals, the
essential/discretionary split, the 50/30/20 Wants share and the anomaly
baseline simultaneously.

Measured on one real 6,961-row ledger: 4 such rows worth 216,985.85, i.e. 5.43%
of the 3,994,751 live expense total. The persisted December-2024 rollup read a
-180.1% savings rate against a loss-free -68.4%.

This column stores exact ``"Category::Subcategory"`` keys the user has declared
to be realised losses -- the same contract as the four income-classification
lists. Nothing is backfilled: only the user can say which of their own rows are
losses, and a guess here would silently rewrite their historical numbers. It
therefore ships EMPTY, meaning every aggregate keeps its current behaviour until
the user configures it, and the ``/api/analytics/v2/data-health`` signal is what
surfaces candidate rows and asks them to classify.

``monthly_summaries.capital_losses`` is the matching rollup bucket. Classified
losses come OUT of ``total_expenses`` and land here instead, so consumption
metrics (``savings_rate``, ``expense_ratio``, the essential/discretionary split)
stop counting them while ``net_savings`` still subtracts them -- the cash did
leave the account. It is a separate column rather than a negative contribution
to ``investment_income`` because the API publishes
``salary + investment + other == total_income``.

``server_default`` on both columns so existing rows get a valid value without a
data-migration pass: ``'[]'`` for the preference (nothing classified, every
aggregate unchanged) and ``'0'`` for the bucket (recomputed on the next
analytics refresh).

Follows the repo convention of an empty ``downgrade()`` (restore from a
database backup to roll back).
"""

import sqlalchemy as sa
from alembic import op

revision: str = "capital_loss_categories_2026"
down_revision: str | None = "rollup_split_backfill_2026"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "capital_loss_categories",
            sa.Text(),
            nullable=False,
            server_default="[]",
        ),
    )
    for table in ("monthly_summaries", "fy_summaries"):
        op.add_column(
            table,
            sa.Column(
                "capital_losses",
                sa.Numeric(precision=15, scale=2),
                nullable=False,
                server_default="0",
            ),
        )


def downgrade() -> None:
    """No downgrade -- restore from a database backup."""

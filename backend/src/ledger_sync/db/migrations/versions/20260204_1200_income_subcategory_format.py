"""Convert income classification to subcategory format.

Changes from category-level (e.g., "Employment Income") to subcategory-level
(e.g., "Employment Income::Salary") for granular tax classification.

Revision ID: income_subcategory_format
Revises: simplify_income_classification
Create Date: 2026-02-04 12:00:00.000000
"""

import json

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "income_subcategory_format"
down_revision = "simplify_income_classification"
branch_labels = None
depends_on = None

# Default subcategory mappings based on your data
TAXABLE_DEFAULTS = [
    "Employment Income::Salary",
    "Employment Income::Stipend",
    "Employment Income::Bonuses",
    "Employment Income::RSUs",
    "Business/Self Employment Income::Gig Work Income",
]

INVESTMENT_DEFAULTS = [
    "Investment Income::Dividends",
    "Investment Income::Interest",
    "Investment Income::F&O Income",
    "Investment Income::Stock Market Profits",
]

NON_TAXABLE_DEFAULTS = [
    "Refund & Cashbacks::Credit Card Cashbacks",
    "Refund & Cashbacks::Other Cashbacks",
    "Refund & Cashbacks::Product/Service Refunds",
    "Refund & Cashbacks::Deposits Return",
    "Employment Income::Expense Reimbursement",
]

OTHER_DEFAULTS = [
    "One-time Income::Gifts",
    "One-time Income::Pocket Money",
    "One-time Income::Competition/Contest Prizes",
    "Employment Income::EPF Contribution",
    "Other::Other",
]


def upgrade() -> None:
    """Convert category-level to subcategory-level classification."""
    connection = op.get_bind()

    # Update existing data to new subcategory format
    connection.execute(
        sa.text(
            """
            UPDATE user_preferences
            SET taxable_income_categories = :taxable,
                investment_returns_categories = :investment,
                non_taxable_income_categories = :non_taxable,
                other_income_categories = :other
        """
        ),
        {
            "taxable": json.dumps(TAXABLE_DEFAULTS),
            "investment": json.dumps(INVESTMENT_DEFAULTS),
            "non_taxable": json.dumps(NON_TAXABLE_DEFAULTS),
            "other": json.dumps(OTHER_DEFAULTS),
        },
    )


def downgrade() -> None:
    """Revert to category-level classification."""
    connection = op.get_bind()

    # Revert to category-level format
    connection.execute(
        sa.text(
            """
            UPDATE user_preferences
            SET taxable_income_categories = :taxable,
                investment_returns_categories = :investment,
                non_taxable_income_categories = :non_taxable,
                other_income_categories = :other
        """
        ),
        {
            "taxable": '["Employment Income", "Business/Self Employment Income"]',
            "investment": '["Investment Income"]',
            "non_taxable": '["Refund & Cashbacks"]',
            "other": '["One-time Income", "Other", "Modified Balancing"]',
        },
    )

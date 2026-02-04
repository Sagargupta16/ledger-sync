"""Simplify income classification to use actual data categories.

Replace 7 specific income type fields with 4 tax-based classification fields.
Categories are now stored as simple arrays of category names from your data.

Revision ID: simplify_income_classification
Revises: add_income_cats
Create Date: 2026-02-04 11:00:00.000000
"""

import json

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "simplify_income_classification"
down_revision = "add_income_cats"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add new simplified income classification columns and migrate data."""
    # Add new columns with defaults
    op.add_column(
        "user_preferences",
        sa.Column(
            "taxable_income_categories",
            sa.Text(),
            nullable=False,
            server_default='["Employment Income", "Business/Self Employment Income"]',
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "investment_returns_categories",
            sa.Text(),
            nullable=False,
            server_default='["Investment Income"]',
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "non_taxable_income_categories",
            sa.Text(),
            nullable=False,
            server_default='["Refund & Cashbacks"]',
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "other_income_categories",
            sa.Text(),
            nullable=False,
            server_default='["One-time Income", "Other", "Modified Balancing"]',
        ),
    )

    # Migrate data from old columns to new ones
    # Get connection for data migration
    connection = op.get_bind()
    result = connection.execute(
        sa.text(
            "SELECT id, salary_categories, bonus_categories, investment_income_categories, "
            "cashback_categories, employment_benefits_categories, freelance_categories, "
            "gifts_categories FROM user_preferences"
        )
    )

    for row in result:
        # Parse old JSON structures to get category names
        taxable = set()
        investment = set()
        non_taxable = set()
        other = set()

        # Helper to extract category names from old format {category: [subcategories]}
        def extract_categories(json_str: str) -> list[str]:
            try:
                data = json.loads(json_str) if isinstance(json_str, str) else json_str
                return list(data.keys()) if isinstance(data, dict) else []
            except (json.JSONDecodeError, TypeError):
                return []

        # Classify based on old mappings
        for cat in extract_categories(row.salary_categories):
            taxable.add(cat)
        for cat in extract_categories(row.bonus_categories):
            taxable.add(cat)
        for cat in extract_categories(row.employment_benefits_categories):
            taxable.add(cat)
        for cat in extract_categories(row.freelance_categories):
            taxable.add(cat)
        for cat in extract_categories(row.investment_income_categories):
            investment.add(cat)
        for cat in extract_categories(row.cashback_categories):
            non_taxable.add(cat)
        for cat in extract_categories(row.gifts_categories):
            other.add(cat)

        # Update with migrated data
        connection.execute(
            sa.text(
                """
                UPDATE user_preferences
                SET taxable_income_categories = :taxable,
                    investment_returns_categories = :investment,
                    non_taxable_income_categories = :non_taxable,
                    other_income_categories = :other
                WHERE id = :id
            """
            ),
            {
                "id": row.id,
                "taxable": (
                    json.dumps(sorted(taxable))
                    if taxable
                    else '["Employment Income", "Business/Self Employment Income"]'
                ),
                "investment": (
                    json.dumps(sorted(investment)) if investment else '["Investment Income"]'
                ),
                "non_taxable": (
                    json.dumps(sorted(non_taxable)) if non_taxable else '["Refund & Cashbacks"]'
                ),
                "other": (
                    json.dumps(sorted(other))
                    if other
                    else '["One-time Income", "Other", "Modified Balancing"]'
                ),
            },
        )

    # Drop old columns
    op.drop_column("user_preferences", "salary_categories")
    op.drop_column("user_preferences", "bonus_categories")
    op.drop_column("user_preferences", "investment_income_categories")
    op.drop_column("user_preferences", "cashback_categories")
    op.drop_column("user_preferences", "employment_benefits_categories")
    op.drop_column("user_preferences", "freelance_categories")
    op.drop_column("user_preferences", "gifts_categories")


def downgrade() -> None:
    """Restore old income category columns."""
    # Re-add old columns
    op.add_column(
        "user_preferences",
        sa.Column(
            "salary_categories",
            sa.Text(),
            nullable=False,
            server_default='{"Employment Income": ["Salary", "Stipend"]}',
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "bonus_categories",
            sa.Text(),
            nullable=False,
            server_default='{"Employment Income": ["Bonus", "RSUs/Stock Options"]}',
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "investment_income_categories",
            sa.Text(),
            nullable=False,
            server_default='{"Investment Income": ["Dividends", "Interest", "Capital Gains"]}',
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "cashback_categories",
            sa.Text(),
            nullable=False,
            server_default='{"Cashback": ["Credit Card Cashback", "Rewards"]}',
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "employment_benefits_categories",
            sa.Text(),
            nullable=False,
            server_default='{"Employment Income": ["EPF Contribution", "Expense Reimbursement"]}',
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "freelance_categories",
            sa.Text(),
            nullable=False,
            server_default='{"Business/Self Employment Income": ["Gig Work Income"]}',
        ),
    )
    gifts_default = '{"One-time Income": ["Gifts", "Pocket Money", "Competition/Contest Prizes"]}'
    op.add_column(
        "user_preferences",
        sa.Column(
            "gifts_categories",
            sa.Text(),
            nullable=False,
            server_default=gifts_default,
        ),
    )

    # Drop new columns
    op.drop_column("user_preferences", "taxable_income_categories")
    op.drop_column("user_preferences", "investment_returns_categories")
    op.drop_column("user_preferences", "non_taxable_income_categories")
    op.drop_column("user_preferences", "other_income_categories")

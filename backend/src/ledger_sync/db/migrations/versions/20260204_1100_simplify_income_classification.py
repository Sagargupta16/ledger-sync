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


_DEFAULT_TAXABLE = '["Employment Income", "Business/Self Employment Income"]'
_DEFAULT_INVESTMENT = '["Investment Income"]'
_DEFAULT_NON_TAXABLE = '["Refund & Cashbacks"]'
_DEFAULT_OTHER = '["One-time Income", "Other", "Modified Balancing"]'

_NEW_COLUMNS = [
    ("taxable_income_categories", _DEFAULT_TAXABLE),
    ("investment_returns_categories", _DEFAULT_INVESTMENT),
    ("non_taxable_income_categories", _DEFAULT_NON_TAXABLE),
    ("other_income_categories", _DEFAULT_OTHER),
]

_OLD_COLUMNS = [
    "salary_categories",
    "bonus_categories",
    "investment_income_categories",
    "cashback_categories",
    "employment_benefits_categories",
    "freelance_categories",
    "gifts_categories",
]


def _extract_categories(json_str: str) -> list[str]:
    """Extract category names from old format {category: [subcategories]}."""
    try:
        data = json.loads(json_str) if isinstance(json_str, str) else json_str
        return list(data.keys()) if isinstance(data, dict) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _classify_old_categories(row: sa.engine.Row) -> dict[str, set[str]]:
    """Classify a row's old category columns into the new tax-based groups."""
    taxable = set()
    investment = set()
    non_taxable = set()
    other = set()

    # Taxable: salary, bonus, employment benefits, freelance
    taxable.update(_extract_categories(row.salary_categories))
    taxable.update(_extract_categories(row.bonus_categories))
    taxable.update(_extract_categories(row.employment_benefits_categories))
    taxable.update(_extract_categories(row.freelance_categories))

    # Investment
    investment.update(_extract_categories(row.investment_income_categories))

    # Non-taxable
    non_taxable.update(_extract_categories(row.cashback_categories))

    # Other
    other.update(_extract_categories(row.gifts_categories))

    return {
        "taxable": taxable,
        "investment": investment,
        "non_taxable": non_taxable,
        "other": other,
    }


def _serialize_with_default(categories: set[str], default: str) -> str:
    """Serialize a set of categories to JSON, falling back to a default if empty."""
    if categories:
        return json.dumps(sorted(categories))
    return default


def _migrate_row(connection: sa.engine.Connection, row: sa.engine.Row) -> None:
    """Migrate a single user_preferences row from old columns to new columns."""
    groups = _classify_old_categories(row)

    connection.execute(
        sa.text("""
            UPDATE user_preferences
            SET taxable_income_categories = :taxable,
                investment_returns_categories = :investment,
                non_taxable_income_categories = :non_taxable,
                other_income_categories = :other
            WHERE id = :id
        """),
        {
            "id": row.id,
            "taxable": _serialize_with_default(groups["taxable"], _DEFAULT_TAXABLE),
            "investment": _serialize_with_default(groups["investment"], _DEFAULT_INVESTMENT),
            "non_taxable": _serialize_with_default(groups["non_taxable"], _DEFAULT_NON_TAXABLE),
            "other": _serialize_with_default(groups["other"], _DEFAULT_OTHER),
        },
    )


def _add_new_classification_columns() -> None:
    """Add the new simplified income classification columns."""
    for col_name, default in _NEW_COLUMNS:
        op.add_column(
            "user_preferences",
            sa.Column(col_name, sa.Text(), nullable=False, server_default=default),
        )


def _drop_old_classification_columns() -> None:
    """Drop the old income category columns."""
    for col_name in _OLD_COLUMNS:
        op.drop_column("user_preferences", col_name)


def upgrade() -> None:
    """Add new simplified income classification columns and migrate data."""
    _add_new_classification_columns()

    # Migrate data from old columns to new ones
    connection = op.get_bind()
    result = connection.execute(
        sa.text(
            "SELECT id, salary_categories, bonus_categories, investment_income_categories, "
            "cashback_categories, employment_benefits_categories, freelance_categories, "
            "gifts_categories FROM user_preferences"
        )
    )

    for row in result:
        _migrate_row(connection, row)

    _drop_old_classification_columns()


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

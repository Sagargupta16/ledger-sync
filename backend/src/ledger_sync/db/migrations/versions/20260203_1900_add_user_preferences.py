"""Add user preferences table.

Revision ID: add_user_preferences
Revises: add_analytics_v2
Create Date: 2026-02-03 19:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_user_preferences"
down_revision: str | None = "add_analytics_v2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Default JSON values - defined as constants to avoid long lines
_DEFAULT_ESSENTIAL_CATEGORIES = (
    '["Housing", "Healthcare", "Transportation", '
    '"Food & Dining", "Education", "Family", "Utilities"]'
)
_DEFAULT_INVESTMENT_MAPPINGS = (
    '{"Grow Stocks": "stocks", "Grow Mutual Funds": "mutual_funds", '
    '"IND money": "stocks", "FD/Bonds": "fixed_deposits", '
    '"EPF": "ppf_epf", "PPF": "ppf_epf", "RSUs": "stocks"}'
)
_DEFAULT_ANOMALY_TYPES = '["high_expense", "unusual_category", "large_transfer", "budget_exceeded"]'


def upgrade() -> None:
    """Create user_preferences table."""
    preferences = op.create_table(
        "user_preferences",
        # Primary key
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        # 1. Fiscal Year Configuration
        sa.Column("fiscal_year_start_month", sa.Integer(), nullable=False, server_default="4"),
        # 2. Essential vs Discretionary Categories
        sa.Column(
            "essential_categories",
            sa.Text(),
            nullable=False,
            server_default=_DEFAULT_ESSENTIAL_CATEGORIES,
        ),
        # 3. Investment Account Mappings
        sa.Column(
            "investment_account_mappings",
            sa.Text(),
            nullable=False,
            server_default=_DEFAULT_INVESTMENT_MAPPINGS,
        ),
        # 4. Income Source Categories
        sa.Column(
            "salary_categories",
            sa.Text(),
            nullable=False,
            server_default='{"Employment Income": ["Salary", "Stipend"]}',
        ),
        sa.Column(
            "bonus_categories",
            sa.Text(),
            nullable=False,
            server_default='{"Employment Income": ["Bonus", "RSUs/Stock Options"]}',
        ),
        sa.Column(
            "investment_income_categories",
            sa.Text(),
            nullable=False,
            server_default='{"Investment Income": ["Dividends", "Interest", "Capital Gains"]}',
        ),
        # 5. Budget Defaults
        sa.Column(
            "default_budget_alert_threshold",
            sa.Float(),
            nullable=False,
            server_default="80.0",
        ),
        sa.Column("auto_create_budgets", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("budget_rollover_enabled", sa.Boolean(), nullable=False, server_default="0"),
        # 6. Display/Format Preferences
        sa.Column("number_format", sa.String(20), nullable=False, server_default="indian"),
        sa.Column("currency_symbol", sa.String(10), nullable=False, server_default="₹"),
        sa.Column(
            "currency_symbol_position",
            sa.String(10),
            nullable=False,
            server_default="before",
        ),
        sa.Column(
            "default_time_range",
            sa.String(20),
            nullable=False,
            server_default="last_12_months",
        ),
        # 7. Anomaly Detection Settings
        sa.Column("anomaly_expense_threshold", sa.Float(), nullable=False, server_default="2.0"),
        sa.Column(
            "anomaly_types_enabled",
            sa.Text(),
            nullable=False,
            server_default=_DEFAULT_ANOMALY_TYPES,
        ),
        sa.Column(
            "auto_dismiss_recurring_anomalies",
            sa.Boolean(),
            nullable=False,
            server_default="1",
        ),
        # 8. Recurring Transaction Settings
        sa.Column("recurring_min_confidence", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column(
            "recurring_auto_confirm_occurrences",
            sa.Integer(),
            nullable=False,
            server_default="6",
        ),
        # Metadata
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        # Constraints
        sa.PrimaryKeyConstraint("id"),
    )

    # Column defaults supply the same initial preferences on both dialects.
    op.execute(
        preferences.insert().values(
            created_at=sa.func.current_timestamp(),
            updated_at=sa.func.current_timestamp(),
        )
    )


def downgrade() -> None:
    """Drop user_preferences table."""
    op.drop_table("user_preferences")

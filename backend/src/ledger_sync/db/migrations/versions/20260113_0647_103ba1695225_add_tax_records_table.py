"""add_tax_records_table

Revision ID: 103ba1695225
Revises: b08e16c7e62c
Create Date: 2026-01-13 06:47:08.209856

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "103ba1695225"
down_revision: str | None = "b08e16c7e62c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create tax_records table
    op.create_table(
        "tax_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("financial_year", sa.String(length=10), nullable=False),
        sa.Column("gross_salary", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("bonus", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("stipend", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("rsu", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("other_income", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("total_gross_income", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("tds_deducted", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("advance_tax", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("self_assessment_tax", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("total_tax_paid", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("standard_deduction", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("section_80c", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("section_80d", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("other_deductions", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("total_deductions", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("taxable_income", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("source_file", sa.String(length=500), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tax_records_fy", "tax_records", ["financial_year"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tax_records_fy", table_name="tax_records")
    op.drop_table("tax_records")

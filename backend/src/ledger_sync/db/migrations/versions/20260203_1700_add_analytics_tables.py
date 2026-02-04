"""Add analytics and tracking tables.

Revision ID: add_analytics_v2
Revises: 103ba1695225
Create Date: 2026-02-03 17:00:00.000000

This migration adds comprehensive analytics tables:
- Net worth snapshots and investment holdings
- Monthly summaries and category trends
- Transfer flow analysis
- Recurring transaction detection
- Merchant intelligence
- Anomaly detection
- Budgets and financial goals
- Audit logging
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "add_analytics_v2"
down_revision: str | None = "103ba1695225"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Net Worth Snapshots
    op.create_table(
        "net_worth_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("snapshot_date", sa.DateTime(), nullable=False),
        sa.Column("cash_and_bank", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("investments", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("mutual_funds", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("stocks", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("fixed_deposits", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("ppf_epf", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("other_assets", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("credit_card_outstanding", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("loans_payable", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("other_liabilities", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("total_assets", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("total_liabilities", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("net_worth", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("net_worth_change", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("net_worth_change_pct", sa.Float(), server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("source", sa.String(length=50), server_default="upload"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_net_worth_date", "net_worth_snapshots", ["snapshot_date"])

    # Investment Holdings
    op.create_table(
        "investment_holdings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("account", sa.String(length=255), nullable=False),
        sa.Column("investment_type", sa.String(length=100), nullable=False),
        sa.Column("instrument_name", sa.String(length=255), nullable=True),
        sa.Column("invested_amount", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("current_value", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("realized_gains", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("unrealized_gains", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("last_updated", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="1"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_investment_account_type",
        "investment_holdings",
        ["account", "investment_type"],
    )

    # Monthly Summaries
    op.create_table(
        "monthly_summaries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("period_key", sa.String(length=7), nullable=False),
        sa.Column("total_income", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("salary_income", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("investment_income", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("other_income", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("total_expenses", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("essential_expenses", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("discretionary_expenses", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("total_transfers_out", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("total_transfers_in", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("net_investment_flow", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("net_savings", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("savings_rate", sa.Float(), server_default="0"),
        sa.Column("expense_ratio", sa.Float(), server_default="0"),
        sa.Column("income_count", sa.Integer(), server_default="0"),
        sa.Column("expense_count", sa.Integer(), server_default="0"),
        sa.Column("transfer_count", sa.Integer(), server_default="0"),
        sa.Column("total_transactions", sa.Integer(), server_default="0"),
        sa.Column("income_change_pct", sa.Float(), server_default="0"),
        sa.Column("expense_change_pct", sa.Float(), server_default="0"),
        sa.Column("last_calculated", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("period_key"),
    )
    op.create_index("ix_monthly_summary_period", "monthly_summaries", ["period_key"])
    op.create_index("ix_monthly_summary_year_month", "monthly_summaries", ["year", "month"])

    # Category Trends
    op.create_table(
        "category_trends",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("period_key", sa.String(length=7), nullable=False),
        sa.Column("category", sa.String(length=255), nullable=False),
        sa.Column("subcategory", sa.String(length=255), nullable=True),
        sa.Column("transaction_type", sa.String(length=20), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("transaction_count", sa.Integer(), server_default="0"),
        sa.Column("avg_transaction", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("max_transaction", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("min_transaction", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("pct_of_monthly_total", sa.Float(), server_default="0"),
        sa.Column("mom_change", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("mom_change_pct", sa.Float(), server_default="0"),
        sa.Column("last_calculated", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_category_trend_period_category",
        "category_trends",
        ["period_key", "category"],
    )
    op.create_index("ix_category_trend_type", "category_trends", ["transaction_type"])

    # Transfer Flows
    op.create_table(
        "transfer_flows",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("from_account", sa.String(length=255), nullable=False),
        sa.Column("to_account", sa.String(length=255), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("transaction_count", sa.Integer(), server_default="0"),
        sa.Column("avg_transfer", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("last_transfer_date", sa.DateTime(), nullable=True),
        sa.Column("last_transfer_amount", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("from_account_type", sa.String(length=50), nullable=True),
        sa.Column("to_account_type", sa.String(length=50), nullable=True),
        sa.Column("last_calculated", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_transfer_flow_accounts",
        "transfer_flows",
        ["from_account", "to_account"],
        unique=True,
    )

    # Recurring Transactions
    op.create_table(
        "recurring_transactions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("pattern_name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=255), nullable=False),
        sa.Column("subcategory", sa.String(length=255), nullable=True),
        sa.Column("account", sa.String(length=255), nullable=False),
        sa.Column("transaction_type", sa.String(length=20), nullable=False),
        sa.Column("frequency", sa.String(length=20), nullable=False),
        sa.Column("expected_amount", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("amount_variance", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("expected_day", sa.Integer(), nullable=True),
        sa.Column("confidence_score", sa.Float(), server_default="0"),
        sa.Column("occurrences_detected", sa.Integer(), server_default="0"),
        sa.Column("last_occurrence", sa.DateTime(), nullable=True),
        sa.Column("next_expected", sa.DateTime(), nullable=True),
        sa.Column("times_missed", sa.Integer(), server_default="0"),
        sa.Column("is_active", sa.Boolean(), server_default="1"),
        sa.Column("is_user_confirmed", sa.Boolean(), server_default="0"),
        sa.Column("first_detected", sa.DateTime(), nullable=True),
        sa.Column("last_updated", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_recurring_category_account",
        "recurring_transactions",
        ["category", "account"],
    )

    # Merchant Intelligence
    op.create_table(
        "merchant_intelligence",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("merchant_name", sa.String(length=255), nullable=False),
        sa.Column("merchant_aliases", sa.Text(), nullable=True),
        sa.Column("primary_category", sa.String(length=255), nullable=False),
        sa.Column("primary_subcategory", sa.String(length=255), nullable=True),
        sa.Column("total_spent", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("transaction_count", sa.Integer(), server_default="0"),
        sa.Column("avg_transaction", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("first_transaction", sa.DateTime(), nullable=True),
        sa.Column("last_transaction", sa.DateTime(), nullable=True),
        sa.Column("months_active", sa.Integer(), server_default="0"),
        sa.Column("avg_days_between", sa.Float(), server_default="0"),
        sa.Column("is_recurring", sa.Boolean(), server_default="0"),
        sa.Column("last_calculated", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("merchant_name"),
    )
    op.create_index("ix_merchant_name", "merchant_intelligence", ["merchant_name"])

    # Anomalies
    op.create_table(
        "anomalies",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("anomaly_type", sa.String(length=50), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("transaction_id", sa.String(length=64), nullable=True),
        sa.Column("period_key", sa.String(length=7), nullable=True),
        sa.Column("expected_value", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("actual_value", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("deviation_pct", sa.Float(), nullable=True),
        sa.Column("is_reviewed", sa.Boolean(), server_default="0"),
        sa.Column("is_dismissed", sa.Boolean(), server_default="0"),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("detected_at", sa.DateTime(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.transaction_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_anomaly_type_severity", "anomalies", ["anomaly_type", "severity"])
    op.create_index("ix_anomaly_period", "anomalies", ["period_key"])

    # Budgets
    op.create_table(
        "budgets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("category", sa.String(length=255), nullable=False),
        sa.Column("subcategory", sa.String(length=255), nullable=True),
        sa.Column("monthly_limit", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("alert_threshold_pct", sa.Float(), server_default="80"),
        sa.Column("current_month_spent", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("current_month_remaining", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("current_month_pct", sa.Float(), server_default="0"),
        sa.Column("avg_monthly_actual", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("months_over_budget", sa.Integer(), server_default="0"),
        sa.Column("months_under_budget", sa.Integer(), server_default="0"),
        sa.Column("is_active", sa.Boolean(), server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_budget_category", "budgets", ["category"])

    # Financial Goals
    op.create_table(
        "financial_goals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("goal_type", sa.String(length=50), nullable=False),
        sa.Column("target_amount", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("current_amount", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("target_date", sa.DateTime(), nullable=True),
        sa.Column("progress_pct", sa.Float(), server_default="0"),
        sa.Column("monthly_target", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("on_track", sa.Boolean(), server_default="1"),
        sa.Column("status", sa.String(length=20), server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # FY Summaries
    op.create_table(
        "fy_summaries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("fiscal_year", sa.String(length=15), nullable=False),
        sa.Column("start_date", sa.DateTime(), nullable=False),
        sa.Column("end_date", sa.DateTime(), nullable=False),
        sa.Column("total_income", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("salary_income", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("bonus_income", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("investment_income", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("other_income", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("total_expenses", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("tax_paid", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("investments_made", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("net_savings", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("savings_rate", sa.Float(), server_default="0"),
        sa.Column("yoy_income_change", sa.Float(), server_default="0"),
        sa.Column("yoy_expense_change", sa.Float(), server_default="0"),
        sa.Column("yoy_savings_change", sa.Float(), server_default="0"),
        sa.Column("last_calculated", sa.DateTime(), nullable=True),
        sa.Column("is_complete", sa.Boolean(), server_default="0"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fiscal_year"),
    )
    op.create_index("ix_fy_summary_year", "fy_summaries", ["fiscal_year"])

    # Audit Logs
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("operation", sa.String(length=50), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=True),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("changes_summary", sa.Text(), nullable=True),
        sa.Column("source_file", sa.String(length=500), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_operation_entity", "audit_logs", ["operation", "entity_type"])
    op.create_index("ix_audit_created", "audit_logs", ["created_at"])

    # Column Mapping Logs
    op.create_table(
        "column_mapping_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("file_name", sa.String(length=500), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("original_columns", sa.Text(), nullable=False),
        sa.Column("mapped_columns", sa.Text(), nullable=False),
        sa.Column("unmapped_columns", sa.Text(), nullable=True),
        sa.Column("is_valid", sa.Boolean(), nullable=False),
        sa.Column("validation_errors", sa.Text(), nullable=True),
        sa.Column("validation_warnings", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("column_mapping_logs")
    op.drop_table("audit_logs")
    op.drop_table("fy_summaries")
    op.drop_table("financial_goals")
    op.drop_table("budgets")
    op.drop_table("anomalies")
    op.drop_table("merchant_intelligence")
    op.drop_table("recurring_transactions")
    op.drop_table("transfer_flows")
    op.drop_table("category_trends")
    op.drop_table("monthly_summaries")
    op.drop_table("investment_holdings")
    op.drop_table("net_worth_snapshots")

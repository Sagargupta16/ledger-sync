"""Add row-level security as a second net under the user filters.

Revision ID: row_level_security_2026
Revises: idempotency_keys_2026
Create Date: 2026-11-19 11:00:00.000000

Changes no result at release. Each user-owned table gets one PERMISSIVE policy,
``ledger_sync_user_isolation``: every row is visible while ``app.user_id`` is
unset, and only that user's rows once the session has bound it
(``db/row_security.py``). There is no FORCE, so the table owner, which the
app and the migrations connect as today, bypasses the policies. They take
effect only after a console step: a non-owner runtime role without BYPASSRLS
and a swap of the runtime database URL (docs/DEPLOYMENT.md "Row-level
security").

``NULLIF(..., '')`` matters: after any transaction-local setting a custom
GUC reads as an empty string, not NULL, for the rest of that pooled
connection's life. Foreign-key checks and ``ON DELETE CASCADE`` bypass row
security by PostgreSQL rule, so account deletion still cascades.

Exempt on purpose: ``mf_nav_prices`` (public AMFI data) and
``column_mapping_logs`` (no owner column). PostgreSQL only; SQLite has no row
security. ENABLE ROW LEVEL SECURITY needs ACCESS EXCLUSIVE on each table, and
env.py runs every pending revision in one transaction, so those locks are held
until the final commit. They are all taken first, in one sorted LOCK TABLE, so
the revision either holds every table within the 5s lock timeout or fails
closed before changing anything; a failed migrate job is safe to re-run.

The downgrade is real: it drops the policies and disables row security.
"""

from alembic import op

revision: str = "row_level_security_2026"
down_revision: str | None = "idempotency_keys_2026"
branch_labels: str | None = None
depends_on: str | None = None

_LOCK_TIMEOUT = "5s"
_POLICY = "ledger_sync_user_isolation"
_BOUND = "NULLIF(current_setting('app.user_id', true), '')"

# table -> the column that names its owner. Literal on purpose: a migration
# must not change when a model does. tests/integration/test_row_level_security.py
# fails when a table is missing here.
OWNER_COLUMNS: dict[str, str] = {
    "ai_usage_log": "user_id",
    "analytics_state": "user_id",
    "anomalies": "user_id",
    "audit_logs": "user_id",
    "balance_checks": "user_id",
    "bank_alerts": "user_id",
    "budgets": "user_id",
    "categorization_rules": "user_id",
    "category_overrides": "user_id",
    "category_trends": "user_id",
    "cohort_spending": "user_id",
    "daily_summaries": "user_id",
    "external_refs": "user_id",
    "financial_goals": "user_id",
    "foreign_asset_events": "user_id",
    "fy_summaries": "user_id",
    "idempotency_keys": "user_id",
    "import_logs": "user_id",
    "investment_holdings": "user_id",
    "ledger_account_aliases": "user_id",
    "ledger_accounts": "user_id",
    "ledger_categories": "user_id",
    "ledger_subcategories": "user_id",
    "merchant_intelligence": "user_id",
    "mf_holdings": "user_id",
    "mf_transactions": "user_id",
    "monthly_summaries": "user_id",
    "net_worth_snapshots": "user_id",
    "push_subscriptions": "user_id",
    "recurring_transactions": "user_id",
    "rsu_grants": "user_id",
    "rsu_vest_fx": "user_id",
    "rsu_vestings": "user_id",
    "salary_plans": "user_id",
    "saved_filter_views": "user_id",
    "saved_view_pins": "user_id",
    "scheduled_transactions": "user_id",
    "tax_ais_summaries": "user_id",
    "tax_deductions": "user_id",
    "tax_records": "user_id",
    "transaction_embeddings": "user_id",
    "transaction_tags": "user_id",
    "transactions": "user_id",
    "transfer_flows": "user_id",
    "upload_tokens": "user_id",
    "user_ai_settings": "user_id",
    "user_preferences": "user_id",
    "users": "id",
}


def _is_postgresql() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _lock_all() -> None:
    """Take every lock up front, in one fixed order, before changing any table."""
    tables = ", ".join(f'"{table}"' for table in sorted(OWNER_COLUMNS))
    op.execute(f"LOCK TABLE {tables} IN ACCESS EXCLUSIVE MODE")


def upgrade() -> None:
    if not _is_postgresql():
        return
    op.execute(f"SET LOCAL lock_timeout = '{_LOCK_TIMEOUT}'")
    _lock_all()
    for table, column in OWNER_COLUMNS.items():
        rule = f'({_BOUND} IS NULL OR "{column}" = {_BOUND}::integer)'
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
        op.execute(f'DROP POLICY IF EXISTS {_POLICY} ON "{table}"')
        op.execute(
            f'CREATE POLICY {_POLICY} ON "{table}" AS PERMISSIVE FOR ALL TO PUBLIC '
            f"USING {rule} WITH CHECK {rule}"
        )


def downgrade() -> None:
    """Drop the policies and turn row security off; no data is touched."""
    if not _is_postgresql():
        return
    op.execute(f"SET LOCAL lock_timeout = '{_LOCK_TIMEOUT}'")
    _lock_all()
    for table in OWNER_COLUMNS:
        op.execute(f'DROP POLICY IF EXISTS {_POLICY} ON "{table}"')
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')

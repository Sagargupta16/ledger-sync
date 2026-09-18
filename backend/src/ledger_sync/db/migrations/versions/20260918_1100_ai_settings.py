"""Extract AI settings without decrypting credentials or removing legacy columns.

Revision ID: ai_settings_2026
Revises: account_settings_2026
Create Date: 2026-09-18 11:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

from ledger_sync.db.migrations.safety import irreversible

revision: str = "ai_settings_2026"
down_revision: str | None = "account_settings_2026"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError("AI settings backfill requires an online validation connection.")
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        bind.exec_driver_sql("LOCK TABLE users IN EXCLUSIVE MODE")
        bind.exec_driver_sql("LOCK TABLE user_preferences IN SHARE ROW EXCLUSIVE MODE")
    elif bind.dialect.name == "sqlite":
        if not bind.connection.driver_connection.in_transaction:
            bind.exec_driver_sql("BEGIN IMMEDIATE")
        else:
            bind.exec_driver_sql("UPDATE user_preferences SET id=id WHERE 1=0")
    else:
        raise RuntimeError("AI settings support PostgreSQL and SQLite only.")
    # The pre-authentication preferences migration seeded an anonymous default
    # row. It has nothing to transfer. Any other ownerless configuration must
    # stop the migration rather than lose credentials or assign an invented owner.
    invalid_owner = bind.execute(
        sa.text(
            "SELECT 1 FROM user_preferences AS p LEFT JOIN users AS u ON u.id = p.user_id "
            "WHERE u.id IS NULL AND (p.user_id IS NOT NULL OR p.ai_mode <> 'app_bedrock' "
            "OR p.ai_mode IS NULL OR p.ai_provider IS NOT NULL OR p.ai_model IS NOT NULL "
            "OR p.ai_api_key_encrypted IS NOT NULL OR p.ai_daily_token_limit IS NOT NULL "
            "OR p.ai_monthly_token_limit IS NOT NULL) LIMIT 1"
        )
    ).first()
    if invalid_owner is not None:
        raise RuntimeError(
            "AI settings reference an unknown owner. No credentials were copied or changed; "
            "resolve ownership explicitly before retrying the migration."
        )
    duplicate_owner = bind.execute(
        sa.text(
            "SELECT 1 FROM user_preferences WHERE user_id IS NOT NULL "
            "GROUP BY user_id HAVING COUNT(*) > 1 LIMIT 1"
        )
    ).first()
    if duplicate_owner is not None:
        raise RuntimeError(
            "Duplicate AI settings owners prevent migration. No credentials were copied or "
            "changed; resolve the conflicting rows explicitly before retrying."
        )
    op.create_table(
        "user_ai_settings",
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
            autoincrement=False,
        ),
        sa.Column("ai_mode", sa.String(16), nullable=False, server_default="app_bedrock"),
        sa.Column("ai_provider", sa.String(20), nullable=True),
        sa.Column("ai_model", sa.String(100), nullable=True),
        sa.Column("ai_api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("ai_daily_token_limit", sa.Integer(), nullable=True),
        sa.Column("ai_monthly_token_limit", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
    )
    # SQL-to-SQL copy preserves every ciphertext, including unreadable legacy values.
    op.execute(
        sa.text(
            "INSERT INTO user_ai_settings "
            "(user_id, ai_mode, ai_provider, ai_model, ai_api_key_encrypted, "
            "ai_daily_token_limit, ai_monthly_token_limit, created_at, updated_at) "
            "SELECT user_id, ai_mode, ai_provider, ai_model, ai_api_key_encrypted, "
            "ai_daily_token_limit, ai_monthly_token_limit, created_at, updated_at "
            "FROM user_preferences WHERE user_id IS NOT NULL"
        )
    )


@irreversible
def downgrade() -> None:
    # Later writes belong to this table; legacy columns are not a rollback backup.
    pass

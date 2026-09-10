"""Repair identity, ownership, and amount constraints without deleting data.

Revision ID: identity_constraints_2026
Revises: ai_usage_reservations_2026
Create Date: 2026-09-09 15:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

from ledger_sync.db.migrations.safety import irreversible

revision: str = "identity_constraints_2026"
down_revision: str | None = "ai_usage_reservations_2026"
branch_labels: str | None = None
depends_on: str | None = None

_GLOBAL_KEYS = {
    "monthly_summaries": "period_key",
    "merchant_intelligence": "merchant_name",
    "fy_summaries": "fiscal_year",
    "import_logs": "file_hash",
}
_POSITIVE_AMOUNTS = {
    "budgets": ("monthly_limit", "ck_budget_limit_positive"),
    "financial_goals": ("target_amount", "ck_goal_target_positive"),
}
_NAMING_CONVENTION = {"uq": "uq_%(table_name)s_%(column_0_name)s"}


def _validate_existing_data(bind: sa.Connection) -> None:
    duplicate = bind.execute(
        sa.text(
            "SELECT 1 FROM users "
            "WHERE auth_provider IS NOT NULL AND auth_provider_id IS NOT NULL "
            "GROUP BY auth_provider, auth_provider_id HAVING COUNT(*) > 1 LIMIT 1"
        )
    ).first()
    if duplicate is not None:
        raise RuntimeError(
            "Duplicate OAuth provider identities prevent the identity constraint upgrade. "
            "No accounts were merged or deleted. Review the conflicting accounts from a "
            "verified backup, resolve ownership explicitly, then rerun the migration."
        )

    for table, (column, _constraint) in _POSITIVE_AMOUNTS.items():
        invalid = bind.execute(
            sa.text(f"SELECT 1 FROM {table} WHERE {column} <= 0 LIMIT 1")
        ).first()
        if invalid is not None:
            raise RuntimeError(
                f"Nonpositive {table}.{column} prevents the constraint upgrade. "
                "No financial values were changed. Correct the invalid records with "
                "their owner's approval, then rerun the migration."
            )


def _add_identity_constraint(bind: sa.Connection) -> None:
    inspector = sa.inspect(bind)
    identity_columns = {"auth_provider", "auth_provider_id"}
    constraints = inspector.get_unique_constraints("users")
    indexes = inspector.get_indexes("users")
    if any(set(item["column_names"]) == identity_columns for item in constraints) or any(
        item["unique"] and set(item["column_names"]) == identity_columns for item in indexes
    ):
        return

    # A unique index enforces the same NULL and duplicate semantics without
    # rebuilding users or touching its many referencing tables on SQLite.
    op.create_index(
        "uq_users_auth_provider_identity",
        "users",
        ["auth_provider", "auth_provider_id"],
        unique=True,
    )


def _remove_obsolete_global_keys(bind: sa.Connection) -> None:
    for table, column in _GLOBAL_KEYS.items():
        inspector = sa.inspect(bind)
        constraints = [
            item
            for item in inspector.get_unique_constraints(table)
            if item["column_names"] == [column]
        ]
        indexes = [
            item
            for item in inspector.get_indexes(table)
            if item["unique"]
            and item["column_names"] == [column]
            and not item.get("duplicates_constraint")
        ]
        if not constraints and not indexes:
            continue
        with op.batch_alter_table(table, naming_convention=_NAMING_CONVENTION) as batch:
            for constraint in constraints:
                batch.drop_constraint(constraint["name"] or f"uq_{table}_{column}", type_="unique")
            for index in indexes:
                batch.drop_index(index["name"])


def _add_amount_constraints(bind: sa.Connection) -> None:
    for table, (column, name) in _POSITIVE_AMOUNTS.items():
        existing = {item["name"] for item in sa.inspect(bind).get_check_constraints(table)}
        if name not in existing:
            with op.batch_alter_table(table) as batch:
                batch.create_check_constraint(name, f"{column} > 0")


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Keep validation and constraint creation under the same write locks.
        bind.execute(
            sa.text("LOCK TABLE users, budgets, financial_goals IN SHARE ROW EXCLUSIVE MODE")
        )
    _validate_existing_data(bind)
    _add_identity_constraint(bind)
    _remove_obsolete_global_keys(bind)
    _add_amount_constraints(bind)


@irreversible
def downgrade() -> None:
    """Account identity guarantees require backup or forward recovery."""

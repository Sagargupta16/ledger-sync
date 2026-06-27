"""optimize transaction indexes (user-scoped, equality-first)

Revision ID: optimize_tx_indexes_2026
Revises: cohort_spending_2026
Create Date: 2026-06-27 15:00:00.000000

Every query against ``transactions`` is user-scoped
(``WHERE user_id = ? AND is_deleted = false`` then a date / type / category /
account filter), so non-user-scoped indexes (date, type, category,
date_type, category_subcategory) can never be chosen by the planner -- they
only taxed writes and bloated storage. This replaces the historical index set
(which had drifted between autogenerate and migrations) with a single canonical
set of user-scoped, equality-first composites.

Defensive + idempotent: it inspects the live indexes and only drops/creates as
needed, so it converges whether the DB was built by ``create_all`` or by the
older migrations. Index DDL is cheap on the per-user data volumes here, so this
is not gated to a maintenance window.
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "optimize_tx_indexes_2026"
down_revision: str | None = "cohort_spending_2026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE = "transactions"

# The canonical target set: name -> columns. Everything else (except the FK
# index on user_id and the last_seen_at reconciliation index) is dropped.
TARGET_INDEXES: dict[str, list[str]] = {
    "ix_transactions_user_date": ["user_id", "date"],
    "ix_transactions_user_type_date": ["user_id", "type", "date"],
    "ix_transactions_user_category": ["user_id", "category"],
    "ix_transactions_user_account": ["user_id", "account"],
    "ix_transactions_user_from_account": ["user_id", "from_account"],
    "ix_transactions_user_to_account": ["user_id", "to_account"],
}

# Indexes that serve a different purpose and must be preserved if present.
KEEP_INDEXES = {
    "ix_transactions_user_id",  # FK / cascade
    "ix_transactions_last_seen_at",  # reconciliation lookup
}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {idx["name"] for idx in inspector.get_indexes(TABLE) if idx.get("name")}

    # Drop anything not in the target set and not explicitly kept.
    for name in existing:
        if name in TARGET_INDEXES or name in KEEP_INDEXES:
            continue
        op.drop_index(name, table_name=TABLE)

    # Create the target indexes that don't already exist.
    for name, cols in TARGET_INDEXES.items():
        if name not in existing:
            op.create_index(name, TABLE, cols, unique=False)


def downgrade() -> None:
    # Per project convention: rollback via DB backup, not down-migration.
    pass

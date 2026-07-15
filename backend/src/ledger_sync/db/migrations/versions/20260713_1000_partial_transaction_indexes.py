"""rebuild transaction indexes as partial over live rows

Revision ID: partial_tx_indexes_2026
Revises: tags_rules_views_2026
Create Date: 2026-07-13 10:00:00.000000

Every read path filters ``is_deleted = false`` (via ``query_helpers`` /
``.is_(False)``), so soft-deleted rows are dead weight in every composite
index. Rebuilding the six user-scoped composites as PARTIAL indexes over the
live rows shrinks them and lets the planner skip tombstones entirely.

Also drops the stray single-column ``ix_transactions_is_deleted`` if present
(model drift -- a lone boolean index is useless under user-scoped queries).

Predicate forms are dialect-specific and empirically verified:
  - SQLite matches partial-index predicates near-textually and SQLAlchemy's
    ``.is_(False)`` emits ``is_deleted IS 0`` -> predicate must be
    ``is_deleted IS 0`` (a ``= 0`` predicate is NOT matched by the planner).
  - Postgres proves predicate implication; ``IS false`` implies ``= false``,
    so the canonical ``= false`` form is used.

Idempotent/defensive like optimize_tx_indexes_2026: drops-then-recreates only
what exists/is missing, so it converges from either a create_all or migrated
schema. Index DDL is cheap at this data volume (~7k rows).
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import inspect, text

# revision identifiers, used by Alembic.
revision: str = "partial_tx_indexes_2026"
down_revision: str | None = "tags_rules_views_2026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE = "transactions"

# name -> columns; all rebuilt with the partial predicate.
PARTIAL_INDEXES: dict[str, list[str]] = {
    "ix_transactions_user_date": ["user_id", "date"],
    "ix_transactions_user_type_date": ["user_id", "type", "date"],
    "ix_transactions_user_category": ["user_id", "category"],
    "ix_transactions_user_account": ["user_id", "account"],
    "ix_transactions_user_from_account": ["user_id", "from_account"],
    "ix_transactions_user_to_account": ["user_id", "to_account"],
}

# Single-column boolean index that serves no user-scoped query.
DROP_IF_PRESENT = {"ix_transactions_is_deleted"}


def _predicate(dialect: str) -> str:
    return "is_deleted IS 0" if dialect == "sqlite" else "is_deleted = false"


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = inspect(bind)
    existing = {idx["name"] for idx in inspector.get_indexes(TABLE) if idx.get("name")}

    for name in DROP_IF_PRESENT & existing:
        op.drop_index(name, table_name=TABLE)

    where = _predicate(dialect)
    for name, columns in PARTIAL_INDEXES.items():
        if name in existing:
            op.drop_index(name, table_name=TABLE)
        cols = ", ".join(columns)
        op.execute(text(f"CREATE INDEX {name} ON {TABLE} ({cols}) WHERE {where}"))


def downgrade() -> None:
    """Rebuild the indexes as full (non-partial) composites."""
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {idx["name"] for idx in inspector.get_indexes(TABLE) if idx.get("name")}

    for name, columns in PARTIAL_INDEXES.items():
        if name in existing:
            op.drop_index(name, table_name=TABLE)
        op.create_index(name, TABLE, columns)

"""Add a nullable user-set amount beside the detected recurring amount.

Revision ID: recurring_user_amount_2026
Revises: orm_schema_alignment_2026
Create Date: 2026-10-07 10:00:00.000000

Expand phase of an expand-and-contract change. Analytics refresh re-derives
``expected_amount`` from history for confirmed patterns, so a user edit is
overwritten. ``user_expected_amount`` records the amount the user typed while
``expected_amount`` stays the detected value; NULL means no override. A boolean
"user set" flag could not keep both values.

The column is nullable with no server default and no backfill, so the running
backend (which never names it) and the next backend (which maps it deferred
with no default) both work before and after this revision. PostgreSQL adds a
nullable column without a table rewrite; the brief ACCESS EXCLUSIVE lock uses
a lock timeout so a busy table fails the migration instead of queueing
traffic. The step is skipped when the column already exists with the expected
shape, and any other existing shape stops the revision before a change.
"""

import sqlalchemy as sa
from alembic import op

from ledger_sync.db.migrations.safety import irreversible

revision: str = "recurring_user_amount_2026"
down_revision: str | None = "orm_schema_alignment_2026"
branch_labels: str | None = None
depends_on: str | None = None

_TABLE = "recurring_transactions"
_COLUMN = "user_expected_amount"
_LOCK_TIMEOUT = "10s"


def upgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError("The recurring user amount revision requires an online schema check.")
    bind = op.get_bind()
    existing = {column["name"]: column for column in sa.inspect(bind).get_columns(_TABLE)}
    current = existing.get(_COLUMN)
    if current is not None:
        column_type = current["type"]
        if (
            not current["nullable"]
            or not isinstance(column_type, sa.Numeric)
            or (column_type.precision, column_type.scale) != (15, 2)
        ):
            raise RuntimeError(
                f"{_TABLE}.{_COLUMN} exists but is not a nullable NUMERIC(15, 2). "
                "No rows or schema were changed; resolve the column explicitly and rerun."
            )
        return
    if bind.dialect.name == "postgresql":
        bind.exec_driver_sql(f"SET LOCAL lock_timeout = '{_LOCK_TIMEOUT}'")
    op.add_column(_TABLE, sa.Column(_COLUMN, sa.Numeric(precision=15, scale=2), nullable=True))


@irreversible
def downgrade() -> None:
    """Dropping the column would discard amounts users entered once phase 2 writes it."""

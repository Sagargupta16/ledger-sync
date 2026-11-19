"""Add the idempotency keys behind retry-safe uploads.

Revision ID: idempotency_keys_2026
Revises: feature_domains_2026
Create Date: 2026-11-19 10:00:00.000000

Expand-only and additive: ``idempotency_keys`` is a new table no older backend
names, and the upload routes ignore an ``Idempotency-Key`` header while the
table is absent, so the running backend and the next one both work before and
after it.

The table is skipped when it already exists with the expected columns (a
``create_all`` bootstrap made it), and any other shape stops the revision
before a change. Creating it takes no lock on an existing table beyond the
brief foreign-key reference to ``users``, which the lock timeout guards.

The downgrade is real: the rows are a 24-hour replay cache, not user data.
"""

import sqlalchemy as sa
from alembic import op

revision: str = "idempotency_keys_2026"
down_revision: str | None = "feature_domains_2026"
branch_labels: str | None = None
depends_on: str | None = None

_LOCK_TIMEOUT = "10s"
_TABLE = "idempotency_keys"
_INDEX = "ix_idempotency_keys_user_created"
_COLUMNS = frozenset(
    {
        "id",
        "user_id",
        "route",
        "idempotency_key",
        "request_hash",
        "state",
        "response_body",
        "locked_at",
        "created_at",
        "updated_at",
    }
)


def _exists(inspector: sa.Inspector) -> bool:
    """True when the table is already there; stop on any other shape."""
    if not inspector.has_table(_TABLE):
        return False
    columns = {column["name"] for column in inspector.get_columns(_TABLE)}
    if columns != _COLUMNS:
        raise RuntimeError(
            f"{_TABLE} exists with unexpected columns. No rows or schema were changed; "
            "resolve the table explicitly and rerun."
        )
    return True


def upgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError("The idempotency keys revision requires an online schema check.")
    bind = op.get_bind()
    if _exists(sa.inspect(bind)):
        return
    if bind.dialect.name == "postgresql":
        bind.exec_driver_sql(f"SET LOCAL lock_timeout = '{_LOCK_TIMEOUT}'")
    op.create_table(
        _TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("route", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("response_body", sa.Text(), nullable=True),
        sa.Column("locked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "user_id", "route", "idempotency_key", name="uq_idempotency_keys_user_route_key"
        ),
        sa.CheckConstraint(
            "state IN ('started', 'ledger_saved', 'completed')", name="ck_idempotency_keys_state"
        ),
    )
    op.create_index(_INDEX, _TABLE, ["user_id", "created_at"])


def downgrade() -> None:
    """Drop the replay cache; uploads then run without idempotency, as before."""
    op.drop_index(_INDEX, table_name=_TABLE)
    op.drop_table(_TABLE)

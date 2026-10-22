"""Add Money Manager source identity, account settings and upload tokens.

Revision ID: money_manager_source_2026
Revises: recurring_user_amount_2026
Create Date: 2026-10-22 10:00:00.000000

Expand-only and additive, so the running backend (which never names these
columns or the table) and the next backend both work before and after it:

- ``transactions`` gains ``source_system``, ``source_uid``, ``source_updated_at``
  and ``occurred_at`` (all nullable, no backfill) and a unique index on
  ``(user_id, source_system, source_uid)``. NULLs never collide, so every
  existing row satisfies it.
- ``ledger_accounts`` gains the backup's ``source_uid``, ``account_group``,
  ``statement_day``, ``payment_day`` and ``paid_from_account_id``.
- ``upload_tokens`` holds hashed, upload-only credentials for automations.

PostgreSQL adds nullable columns without a table rewrite; the brief ACCESS
EXCLUSIVE locks use a lock timeout so a busy table fails the migration instead
of queueing traffic. Each step is skipped when its object already exists with
the expected shape, and any other shape stops the revision before a change.
"""

import sqlalchemy as sa
from alembic import op

from ledger_sync.db.migrations.safety import irreversible

revision: str = "money_manager_source_2026"
down_revision: str | None = "recurring_user_amount_2026"
branch_labels: str | None = None
depends_on: str | None = None

_LOCK_TIMEOUT = "10s"
_USER_FK = "users.id"

_COLUMNS: dict[str, list[tuple[str, sa.types.TypeEngine[object]]]] = {
    "transactions": [
        ("source_system", sa.String(length=32)),
        ("source_uid", sa.String(length=64)),
        ("source_updated_at", sa.DateTime()),
        ("occurred_at", sa.DateTime()),
    ],
    "ledger_accounts": [
        ("source_uid", sa.String(length=64)),
        ("account_group", sa.String(length=64)),
        ("statement_day", sa.SmallInteger()),
        ("payment_day", sa.SmallInteger()),
        ("paid_from_account_id", sa.Integer()),
    ],
}
_SOURCE_UID_INDEX = "uq_transactions_source_uid"


def _same_type(existing: sa.types.TypeEngine[object], wanted: sa.types.TypeEngine[object]) -> bool:
    if isinstance(wanted, sa.String):
        return isinstance(existing, sa.String) and existing.length == wanted.length
    if isinstance(wanted, sa.DateTime):
        return isinstance(existing, sa.DateTime)
    return isinstance(existing, sa.Integer)


def _add_columns(inspector: sa.Inspector) -> None:
    for table, columns in _COLUMNS.items():
        existing = {column["name"]: column for column in inspector.get_columns(table)}
        for name, column_type in columns:
            current = existing.get(name)
            if current is None:
                op.add_column(table, sa.Column(name, column_type, nullable=True))
                continue
            if not current["nullable"] or not _same_type(current["type"], column_type):
                raise RuntimeError(
                    f"{table}.{name} exists with an unexpected shape. No rows or schema were "
                    "changed; resolve the column explicitly and rerun."
                )


def _create_source_uid_index(inspector: sa.Inspector) -> None:
    indexes = {index["name"]: index for index in inspector.get_indexes("transactions")}
    current = indexes.get(_SOURCE_UID_INDEX)
    wanted = ["user_id", "source_system", "source_uid"]
    if current is None:
        op.create_index(_SOURCE_UID_INDEX, "transactions", wanted, unique=True)
    elif list(current["column_names"]) != wanted or not current["unique"]:
        raise RuntimeError(
            f"{_SOURCE_UID_INDEX} exists with an unexpected shape. No rows or schema were "
            "changed; resolve the index explicitly and rerun."
        )


def _create_upload_tokens(inspector: sa.Inspector) -> None:
    if inspector.has_table("upload_tokens"):
        columns = {column["name"] for column in inspector.get_columns("upload_tokens")}
        expected = {
            "id",
            "user_id",
            "name",
            "token_prefix",
            "token_hash",
            "scope",
            "created_at",
            "expires_at",
            "last_used_at",
            "revoked_at",
        }
        if columns != expected:
            raise RuntimeError(
                "upload_tokens exists with unexpected columns. No rows or schema were changed; "
                "resolve the table explicitly and rerun."
            )
        return
    op.create_table(
        "upload_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey(_USER_FK, ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("token_prefix", sa.String(length=16), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("scope", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("token_hash", name="uq_upload_tokens_token_hash"),
    )
    op.create_index("ix_upload_tokens_user_id", "upload_tokens", ["user_id"])


def upgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError("The Money Manager source revision requires an online schema check.")
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        bind.exec_driver_sql(f"SET LOCAL lock_timeout = '{_LOCK_TIMEOUT}'")
    inspector = sa.inspect(bind)
    _add_columns(inspector)
    _create_source_uid_index(sa.inspect(bind))
    _create_upload_tokens(sa.inspect(bind))


@irreversible
def downgrade() -> None:
    """Dropping these would discard source identities and live upload credentials."""

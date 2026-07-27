"""add the columns that only ``create_all()`` ever created

Revision ID: reconcile_create_all_2026
Revises: capital_loss_categories_2026
Create Date: 2026-07-27 13:00:00.000000

``init_db()`` calls ``Base.metadata.create_all()`` on every startup, so a
database that has ever booted the app has the full ORM schema whether or not a
migration declared it. That masked a slow drift: twelve columns were added to the
models without a matching migration, and every environment got them from
``create_all`` instead. ``alembic upgrade head`` against an EMPTY database
therefore reached head with a schema the app cannot query -- the first request
touching preferences would fail on ``no such column: payday``.

The columns, all reachable from live code paths:

* ``user_preferences`` -- ``excluded_accounts``, ``fixed_expense_categories``,
  ``monthly_investment_target``, ``notify_anomalies``, ``notify_budget_alerts``,
  ``notify_days_ahead``, ``notify_upcoming_bills``, ``payday``,
  ``preferred_tax_regime``, ``savings_goal_percent``
* ``users`` -- ``last_login``
* ``import_logs`` -- ``user_id`` (plus its index and CASCADE FK; the import
  idempotency check is user-scoped through it)

Every add is guarded on reflection, so this is a no-op on every already-deployed
database and only does work on a from-scratch bootstrap. ``server_default``
values mirror the ORM defaults so pre-existing rows would be valid either way.

``import_logs.user_id`` is NOT NULL in the model. It is added nullable, then
backfilled to the first user and tightened only when that is safe -- on a fresh
database the table is empty, and on an existing one the column is already there
and this whole block is skipped.

Follows the repo convention of an empty ``downgrade()`` (restore from a
database backup to roll back).
"""

import sqlalchemy as sa
from alembic import op

revision: str = "reconcile_create_all_2026"
down_revision: str | None = "capital_loss_categories_2026"
branch_labels: str | None = None
depends_on: str | None = None


# (table, column spec) -- server_default mirrors the ORM-side default.
_MISSING_COLUMNS: list[tuple[str, sa.Column]] = [
    (
        "user_preferences",
        sa.Column("excluded_accounts", sa.Text(), nullable=False, server_default="[]"),
    ),
    (
        "user_preferences",
        sa.Column("fixed_expense_categories", sa.Text(), nullable=False, server_default="[]"),
    ),
    (
        "user_preferences",
        sa.Column("monthly_investment_target", sa.Float(), nullable=False, server_default="0"),
    ),
    (
        "user_preferences",
        sa.Column("notify_anomalies", sa.Boolean(), nullable=False, server_default=sa.true()),
    ),
    (
        "user_preferences",
        sa.Column("notify_budget_alerts", sa.Boolean(), nullable=False, server_default=sa.true()),
    ),
    (
        "user_preferences",
        sa.Column("notify_days_ahead", sa.Integer(), nullable=False, server_default="7"),
    ),
    (
        "user_preferences",
        sa.Column("notify_upcoming_bills", sa.Boolean(), nullable=False, server_default=sa.true()),
    ),
    ("user_preferences", sa.Column("payday", sa.Integer(), nullable=False, server_default="1")),
    (
        "user_preferences",
        sa.Column(
            "preferred_tax_regime", sa.String(length=10), nullable=False, server_default="new"
        ),
    ),
    (
        "user_preferences",
        sa.Column("savings_goal_percent", sa.Float(), nullable=False, server_default="20"),
    ),
    ("users", sa.Column("last_login", sa.DateTime(), nullable=True)),
]


def _columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {col["name"] for col in inspector.get_columns(table)}


def _indexes(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {idx["name"] for idx in inspector.get_indexes(table) if idx.get("name")}


def _add_import_logs_user_id() -> None:
    """Add the user-scoping FK column to ``import_logs``."""
    bind = op.get_bind()

    if "user_id" not in _columns("import_logs"):
        op.add_column("import_logs", sa.Column("user_id", sa.Integer(), nullable=True))
        first_user = bind.execute(sa.text("SELECT id FROM users ORDER BY id LIMIT 1")).scalar()
        if first_user is not None:
            bind.execute(
                sa.text("UPDATE import_logs SET user_id = :uid WHERE user_id IS NULL"),
                {"uid": first_user},
            )
        # Only tighten to NOT NULL once no row can violate it. A database with
        # import history but no users cannot happen (the FK is the owner link),
        # but leaving the column nullable beats failing the upgrade.
        orphans = bind.execute(
            sa.text("SELECT COUNT(*) FROM import_logs WHERE user_id IS NULL"),
        ).scalar()
        if not orphans:
            with op.batch_alter_table("import_logs") as batch_op:
                batch_op.alter_column("user_id", existing_type=sa.Integer(), nullable=False)
                batch_op.create_foreign_key(
                    "fk_import_logs_user_id_cascade",
                    "users",
                    ["user_id"],
                    ["id"],
                    ondelete="CASCADE",
                )

    if "ix_import_logs_user_id" not in _indexes("import_logs"):
        op.create_index("ix_import_logs_user_id", "import_logs", ["user_id"], unique=False)


def upgrade() -> None:
    for table, column in _MISSING_COLUMNS:
        if column.name not in _columns(table):
            op.add_column(table, column)

    _add_import_logs_user_id()


def downgrade() -> None:
    """No downgrade -- restore from a database backup."""

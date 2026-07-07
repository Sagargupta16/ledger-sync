"""add tags, categorization rules, and saved filter views tables

Revision ID: tags_rules_views_2026
Revises: cascade_user_fks_2026
Create Date: 2026-07-07 12:00:00.000000

Adds three user-scoped tables for the organization feature set:

``categorization_rules`` -- ordered "note/account contains X -> set
category Y" rules. Applied pre-hash at import time and on-demand via
POST /api/categorization-rules/apply. ``match_field`` is a plain
validated string (Pydantic pattern), not a DB enum, to keep this
migration a set of plain CREATEs.

``transaction_tags`` -- one row per (transaction, tag) association.
Free-string tags, no lookup table: server-side filtering uses an
EXISTS subquery, facets use GROUP BY tag, and PATCH set-tags is a
delete+insert. The (user_id, transaction_id, tag) unique index also
serves the per-transaction lookup; (user_id, tag) serves facets and
the tag filter.

``saved_filter_views`` -- named snapshots of the frontend filter
state. ``filters`` is an opaque JSON string the backend never
inspects, so new frontend filter fields need zero backend changes.
POST upserts by (user_id, name), enforced by the unique index.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "tags_rules_views_2026"
down_revision: str | None = "cascade_user_fks_2026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "categorization_rules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("match_field", sa.String(length=20), nullable=False, server_default="note"),
        sa.Column("pattern", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=255), nullable=False),
        sa.Column("subcategory", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_categorization_rules_user", "categorization_rules", ["user_id"], unique=False
    )

    op.create_table(
        "transaction_tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.String(length=64), nullable=False),
        sa.Column("tag", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["transaction_id"], ["transactions.transaction_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_transaction_tags_user_txn_tag",
        "transaction_tags",
        ["user_id", "transaction_id", "tag"],
        unique=True,
    )
    op.create_index(
        "ix_transaction_tags_user_tag",
        "transaction_tags",
        ["user_id", "tag"],
        unique=False,
    )

    op.create_table(
        "saved_filter_views",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("filters", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_saved_filter_views_user_name",
        "saved_filter_views",
        ["user_id", "name"],
        unique=True,
    )


def downgrade() -> None:
    # Per project convention: rollback via DB backup, not down-migration.
    pass

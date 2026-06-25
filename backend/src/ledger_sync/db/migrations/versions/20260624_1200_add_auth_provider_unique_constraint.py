"""add unique constraint on (auth_provider, auth_provider_id)

Identity for OAuth users must be keyed on the provider identity, not email,
to prevent cross-provider account linking. NULLs (legacy/email accounts with
no provider) are distinct under a unique constraint in both SQLite and
Postgres, so they never collide.

Revision ID: f7a8b9c0d1e2
Revises: 9cbf967f67a6
Create Date: 2026-06-24 12:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f7a8b9c0d1e2"
down_revision: str | None = "9cbf967f67a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Production (the only place migrations run, via migrate.yml) is Postgres,
    # where ALTER TABLE ADD CONSTRAINT works directly. SQLite dev builds its
    # schema from the ORM via init_db()/create_all (which already includes this
    # constraint), and SQLite can't ADD CONSTRAINT in place, so skip it there.
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        return
    op.create_unique_constraint(
        "uq_users_auth_provider_identity",
        "users",
        ["auth_provider", "auth_provider_id"],
    )


def downgrade() -> None:
    # Per project convention: rollback via DB backup, not down-migration.
    pass

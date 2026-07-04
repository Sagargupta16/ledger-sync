"""add token_version to users for JWT session revocation

Revision ID: token_version_2026
Revises: optimize_tx_indexes_2026
Create Date: 2026-07-04 10:00:00.000000

Adds ``users.token_version`` INT NOT NULL DEFAULT 0. This column is baked
into every JWT payload as the ``tv`` claim. Auth verifies at decode time
that the token's ``tv`` matches the user's current value; bumping the
column on logout / reset / delete invalidates every outstanding token
for that user in a single write, without a per-token blocklist.

Backward compatibility: existing JWTs (issued before this migration and
before the code that reads ``tv`` deploys) have no ``tv`` claim.
``verify_token`` treats a missing ``tv`` as 0 during rollout, so those
tokens still work until they expire (max 30 min access, 7 d refresh).
Setting ``LEDGER_SYNC_JWT_STRICT_TV=true`` on day 8 flips to strict mode
and rejects tokens without a ``tv`` claim.
"""

import sqlalchemy as sa
from alembic import op

revision: str = "token_version_2026"
down_revision: str | None = "optimize_tx_indexes_2026"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    # Per project convention: rollback via DB backup, not down-migration.
    pass

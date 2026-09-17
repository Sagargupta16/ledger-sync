"""Separate source fingerprints from existing public transaction identities."""

import sqlalchemy as sa
from alembic import op

from ledger_sync.db.migrations.safety import irreversible

revision = "stable_import_identity_2026"
down_revision = "schema_integrity_2026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Legacy rows remain untouched. On the next exact import match, the importer
    # adopts a v2 fingerprint without moving the PK or any child annotations.
    op.add_column("transactions", sa.Column("source_fingerprint", sa.String(64), nullable=True))
    op.add_column(
        "transactions",
        sa.Column("fingerprint_version", sa.Integer(), nullable=False, server_default="1"),
    )
    # A unique index avoids rebuilding SQLite's parent table and cascading its
    # child rows. Multiple NULL fingerprints intentionally support legacy rows.
    op.create_index(
        "uq_transactions_source", "transactions", ["user_id", "source_fingerprint"], unique=True
    )


@irreversible
def downgrade() -> None:
    # Downgrading the writer after v2 imports would recreate IDs and orphan
    # annotations on a reupload, even though dropping the columns looks additive.
    pass

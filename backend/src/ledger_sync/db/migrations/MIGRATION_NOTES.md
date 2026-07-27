# Migration Notes

Current for Ledger Sync 2.23.0.

## Current Chain

- Script location: `src/ledger_sync/db/migrations`
- Revision files: 42
- Base revision: `343e4412d829`
- Current head: `reconcile_create_all_2026`
- Local database: SQLite
- Production database: Neon PostgreSQL 17

Alembic imports `ledger_sync.db.models`, which registers every model exported
from `ledger_sync.db._models`.

## Create and Apply a Revision

Define models in the relevant file under `db/_models/`, export them from
`db/_models/__init__.py`, and then run:

```powershell
cd backend
uv run alembic revision --autogenerate -m "describe the schema change"
uv run alembic upgrade head
uv run alembic current
```

Inspect generated operations before applying them. Autogenerate does not know
the intended data migration or deployment order.

## From-Scratch Bootstrap

`init_db()` calls `Base.metadata.create_all()` on every startup
(`db/session.py`), so any database that has booted the app carries the full ORM
schema whether or not a migration declared it. That masked a long drift: the
migrations were never the complete schema, and `uv run alembic upgrade head`
against an EMPTY database failed at
`batch_op.drop_index(op.f("ix_fy_summaries_fiscal_year"))` because the revision
that creates `fy_summaries` names that index `ix_fy_summary_year`.

The chain now builds a usable database on its own. Four earlier revisions were
made safe against objects only `create_all()` had ever produced, and
`reconcile_create_all_2026` adds the twelve columns that had been reaching
deployed databases through `create_all()` alone.

`backend/tests/integration/test_migrations_from_scratch.py` guards the path: it
upgrades a fresh SQLite file, compares the migrated tables and columns against
the ORM metadata, and re-runs the upgrade to confirm the guards are idempotent.
The backend CI job runs the same upgrade against a throwaway database.

Production only ever applies incremental revisions, and `create_all()` runs
there on startup, so a missing migration stays invisible in production. Add the
migration anyway.

## Rollback Policy

Most migrations from 2026-03-02 onward intentionally have empty `downgrade()`
functions; two later revisions (`c1511eec274c` and `partial_tx_indexes_2026`)
still carry generated bodies that the rollback plan does not rely on. Rolling
back past `add_analytics_v2` is not supported through Alembic.

For a failed production migration:

1. Stop further writes if data integrity is at risk.
2. Restore the backup taken before the migration, or ship a tested forward
   repair revision.
3. Keep the deployed application compatible with the resulting schema.

Never assume `uv run alembic downgrade -1` is safe.

## Cross-Database Rules

Raw SQL in the chain is dialect-specific in both directions. The 2026-02-03
`add_user_preferences` seed builds its default row with SQLite-only
`datetime('now')`; `c7f8a9b0d1e2` goes the other way with PostgreSQL-only
`now()`; `f1a2b3c4d5e6` issues `ALTER TYPE ... ADD VALUE` behind a dialect
check; and `partial_tx_indexes_2026` branches its partial-index predicate per
dialect. The from-scratch gate only proves the SQLite path, so review these
before replaying the full chain against a new PostgreSQL database.

New migrations must account for both supported dialects. Use Alembic batch
operations where SQLite needs table recreation, preserve foreign-key names,
and test PostgreSQL constraint changes explicitly.

Application queries must use the date helpers in
`ledger_sync.core.query_helpers` instead of raw `strftime`.

## Production Workflow

`.github/workflows/migrate.yml` runs `uv run --no-sync --locked --no-build
alembic upgrade head` with Python 3.14 when migration or model paths change on
`main`. It uses the `LEDGER_SYNC_DATABASE_URL` GitHub Actions secret. The
backend CI job runs on 3.13, so a revision must work on both.

Schema changes must be backward compatible because the migration job and
Vercel deployment can run concurrently. Use expand-and-contract changes across
separate releases for destructive renames or removals.

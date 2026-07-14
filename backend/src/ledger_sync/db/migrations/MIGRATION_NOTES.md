# Migration Notes

Current for Ledger Sync 2.22.0.

## Current Chain

- Script location: `src/ledger_sync/db/migrations`
- Revision files: 33
- Base revision: `343e4412d829`
- Current head: `tags_rules_views_2026`
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

## Rollback Policy

Migrations from 2026-02-03 onward intentionally have empty `downgrade()`
functions. Rolling back past `add_analytics_v2` is not supported through
Alembic.

For a failed production migration:

1. Stop further writes if data integrity is at risk.
2. Restore the backup taken before the migration, or ship a tested forward
   repair revision.
3. Keep the deployed application compatible with the resulting schema.

Never assume `uv run alembic downgrade -1` is safe.

## Cross-Database Rules

Several older data migrations contain raw SQLite-specific SQL in
`op.execute()`. Review them before replaying the full chain against a new
PostgreSQL database.

New migrations must account for both supported dialects. Use Alembic batch
operations where SQLite needs table recreation, preserve foreign-key names,
and test PostgreSQL constraint changes explicitly.

Application queries must use the date helpers in
`ledger_sync.core.query_helpers` instead of raw `strftime`.

## Production Workflow

`.github/workflows/migrate.yml` runs `uv run alembic upgrade head` with Python
3.13 when migration or model paths change on `main`. It uses the
`LEDGER_SYNC_DATABASE_URL` GitHub Actions secret.

Schema changes must be backward compatible because the migration job and
Vercel deployment can run concurrently. Use expand-and-contract changes across
separate releases for destructive renames or removals.

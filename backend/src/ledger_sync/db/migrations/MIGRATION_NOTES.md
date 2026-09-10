# Migration Notes

Current for Ledger Sync 2.24.1.

## Revision Chain

- Script location: `src/ledger_sync/db/migrations`
- Base revision: `343e4412d829`
- Supported databases: SQLite locally, PostgreSQL 17 in production
- Inspect the current head with `uv run alembic heads`.
- The September identity repair follows `ai_usage_reservations_2026` as
  `identity_constraints_2026`; subsequent revisions must keep a single head.

Alembic imports `ledger_sync.db.models`, which registers every model exported
from `ledger_sync.db._models`. `create_all()` only creates missing tables. It
cannot add missing columns or constraints to existing tables, and is not a
substitute for migrations.

## Create and Apply a Revision

Define models in the relevant file under `db/_models/`, export them from
`db/_models/__init__.py`, and then run:

```powershell
cd backend
uv run alembic revision --autogenerate -m "describe the schema change"
uv run alembic heads
uv run alembic upgrade head
uv run alembic current
```

Inspect generated operations before applying them. Autogenerate does not know
the intended data migration, account ownership, or deployment order. Do not
stamp a failed migration as applied.

## Bootstrap and Constraint Verification

`tests/integration/test_migrations_from_scratch.py` upgrades a fresh database
without calling `create_all()`. It compares table and column coverage, primary
keys, uniqueness semantics, foreign keys and delete rules, and check constraints
with the ORM. It also exercises duplicate identities, preserved parent/child
rows, invalid amounts, cascade deletes, orphan rejection, and repeat upgrades.
Index names may differ; the constrained columns and behavior must agree.

SQLite tests always run. The PostgreSQL cases require
`LEDGER_SYNC_TEST_POSTGRES_URL` to point to a local disposable database named
`ledger_sync_test*`. Each case creates and removes a unique schema owned by the
test. Remote endpoints and other database names are refused. CI uses the
runner's installed native PostgreSQL binaries to start an isolated loopback
cluster, logs its version, and runs these cases as a release gate. It stops
only its owned cluster afterward and uses no containers.
Three PostgreSQL concurrency cases race six independent server connections for
one remaining daily message, daily token, or monthly token reservation. Each
case must admit one worker, reject five with 429, and persist one reservation.

Tests supply an explicit connection through Alembic's configuration attributes,
so the migration environment does not read application settings or environment
files. Normal operator CLI commands continue to use configured settings.

## Identity and Ownership Repair

`identity_constraints_2026`:

- Rejects duplicate non-null `(auth_provider, auth_provider_id)` identities
  before any change. It never merges users or chooses an account owner.
- Adds the missing SQLite OAuth unique index without rebuilding `users` or
  touching referencing tables. Legacy null identities remain valid.
- Removes obsolete global uniqueness on monthly period, merchant name,
  fiscal year, and import hash. These constraints incorrectly prohibited
  different users from storing the same values. The user-scoped monthly key
  remains unique.
- Adds the ORM's positive budget and goal amount checks. Existing nonpositive
  values stop the revision before schema changes, with an explicit recovery
  message. The migration does not rewrite financial values.

If preflight reports conflicting data, preserve a verified backup, review the
specific accounts or values with their owners, correct them explicitly, and
retry the migration. No automatic cleanup deletes users or ledger records.

## Rollback and Recovery

The 24 historical no-op downgrade functions are marked `@irreversible` and
raise an error. The environment materializes and checks the entire downgrade
plan before the first migration operation. A multi-revision rollback cannot
apply earlier reversible steps and then leave a partially downgraded database
when it reaches an unsupported revision. The version marker stays unchanged.
New revision templates use the same guard; remove it only for an explicitly
reviewed and tested reversible migration.

The transfer consolidation revision `b08e16c7e62c` is also guarded. It cannot
reconstruct the original transfer legs or safely remove the account-link
columns. A direct downgrade is rejected with data, schema, and version intact.

For a failed production migration:

1. Stop further writes if data integrity is at risk.
2. Restore the pre-migration backup into a separate database and validate its
   data, constraints, and revision before any production cutover.
3. Prefer a tested forward repair when restoration would discard valid writes.
4. Keep the deployed application compatible with the resulting schema.

Do not treat `alembic downgrade -1` or `alembic stamp` as a recovery shortcut.
A database restore, application rollback, and external deployment promotion are
separate operations that need an explicit coordinated release.

## Cross-Database Rules

The historical bootstrap uses the uppercase enum names SQLAlchemy persists.
Legacy text comparisons cast enum columns to text before comparing alternate
spellings. Shared PostgreSQL enum types are reused instead of created twice.
The transfer consolidation adds a missing enum label before using it, including
the required commit boundary on an existing PostgreSQL enum.

Transfer consolidation preserves incoming legs without an outgoing counterpart.
It collapses only a single incoming/outgoing pair with the same date, amount,
currency, accounts, subcategory, note, source file, last-seen timestamp, and
deletion state. Ambiguous groups and different source metadata are retained.
Conflicting transaction/transfer IDs stop the revision before any changes.

Scheduled transactions explicitly create `transactiontype` with `checkfirst`
before reusing it. Historical PostgreSQL ledgers with a VARCHAR transaction type
therefore bootstrap successfully without attempting to recreate an existing
enum or alter the ledger's original column type.

Preference seeding uses typed SQLAlchemy inserts and database-independent
`CURRENT_TIMESTAMP`. Timestamp repair uses Alembic batch operations for SQLite.
Foreign-key discovery uses schema-aware reflection and skips columns that a
later revision creates during fresh bootstrap.

New migrations must work on both supported dialects. Use batch operations where
SQLite requires table recreation, preserve foreign keys, and verify populated
upgrades as well as an empty bootstrap. PostgreSQL-only behavior needs the
native PostgreSQL CI cluster; SQLite success is not evidence for that path.

Application queries use date helpers in `ledger_sync.core.query_helpers`
instead of raw `strftime`. PostgreSQL request timeouts use `SET LOCAL` at each
transaction boundary, so they remain effective through a transaction pooler.

## Production Rollout

`ci.yml` calls `migrate.yml` only after frontend, backend, security, and
PostgreSQL migration checks pass for the same `main` commit. Migrations use
Python 3.13, locked dependencies, the `production` environment, and the direct
Neon endpoint stored in the GitHub `LEDGER_SYNC_DATABASE_URL` secret. The
application's separately configured value uses the pooler. Main releases and
migration jobs do not cancel an active run.

Pages deployment follows migration success. Manually dispatch the **CI**
workflow on `main` to repeat the same gated path. Vercel's GitHub integration
remains external to this job graph; configure its production protection or
promote a validated backend deployment after migration success. Until then,
schema changes must remain backward compatible. Use expand-and-contract changes
across separate releases for destructive renames or removals.

Apply the AI reservation migration before the new backend code. Drain old
workers before v3 encrypted-key writes, and retain previous encryption material
until every stored value has been rewrapped. Old code cannot read v3, so an
application rollback must retain a compatible reader or use a coordinated
backup restore. Database reservations serialize daily and monthly quotas across
workers; distributed SlowAPI storage is still required for global per-minute
account and IP limits.

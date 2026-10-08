# Migration Notes

Current for Ledger Sync 2.24.1.

## Revision Chain

- Script location: `src/ledger_sync/db/migrations`
- Base revision: `343e4412d829`
- Supported databases: SQLite locally, PostgreSQL 17 in production
- Inspect the current head with `uv run alembic heads`.
- The September identity repair follows `ai_usage_reservations_2026` as
  `identity_constraints_2026`; subsequent revisions must keep a single head.
- `orm_schema_alignment_2026` follows `domain_storage_cutover_2026`. After a
  fail-closed NULL count (any NULL stops it before a change; nothing is
  backfilled or deleted) it sets NOT NULL on the 118 columns migrations left
  nullable, plus `import_logs.user_id` where `reconcile_create_all_2026` left
  it nullable, adds 10 missing ORM indexes, and drops duplicate indexes. Every
  step changes only what differs. Current writers supply every tightened
  value, so a backend-first deploy is safe. It is irreversible; recover with a
  verified backup or a forward repair.
- `recurring_user_amount_2026` follows `orm_schema_alignment_2026`. It adds
  the nullable `recurring_transactions.user_expected_amount` column (expand
  phase); see [Recurring User Amount](#recurring-user-amount).

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

`uv run alembic check` on a database upgraded to head reports nothing.
`env.py` filters only the documented dialect noise, by exact name: six ORM
enums stored as VARCHAR, three unique indexes standing in for same-named
unique constraints (dropped only as a matched pair), and the nullable
`user_preferences.user_id`. Any other difference fails. CI runs the check
after the SQLite CLI bootstrap and after the PostgreSQL CLI upgrade.

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

## Recurring User Amount

`recurring_user_amount_2026` is the expand phase of an expand-and-contract
change. Analytics refresh re-derives `expected_amount` from history for every
pattern, including confirmed ones, so a user's edited amount is overwritten at
the next refresh. The new `user_expected_amount NUMERIC(15, 2) NULL` column
holds the amount the user typed while `expected_amount` stays the detected
value; NULL means no override. A boolean "amount set by user" flag could not
keep both values.

Phase 1 (this revision) only adds the column: nullable, no server default, no
backfill, skipped when it already exists with that shape, and irreversible
because a downgrade would discard user amounts once phase 2 writes them. The
ORM maps it `deferred` with `FetchedValue()` and `eager_defaults=False` and no
app code names it, so a backend that Vercel promotes before `migrate` runs
never SELECTs, INSERTs, or RETURNs it.
`tests/integration/test_recurring_user_amount_expand.py` runs the recurring
list/create/patch/delete endpoints and an analytics refresh at the previous
head and asserts no emitted statement names the column.

Phase 2 (a later release, after this revision is applied in production):

1. `PATCH /api/analytics/v2/recurring-transactions/{id}` stores an edited
   amount in `user_expected_amount` and leaves `expected_amount` alone;
   `POST` keeps writing `expected_amount` for manual rows.
2. Detection keeps updating `expected_amount` and variance from history and
   never touches `user_expected_amount`, so the user's amount survives
   refresh. `test_confirmed_pattern_with_date_trailer_updates_in_place` keeps
   pinning the detected value.
3. `GET` returns the effective amount (`user_expected_amount` when set, else
   `expected_amount`) as `expected_amount`, plus `detected_amount` and
   `amount_edited`. Monthly totals, sorting, the AI `list_recurring` tool, and
   scheduled-transaction projections use the effective amount.
4. The frontend shows an "edited" state with the detected amount beside it and
   a way to clear the override (PATCH with an explicit reset).
5. The mapping drops `deferred`, `FetchedValue()`, and `eager_defaults=False`
   only once no deployed backend can run against a schema without the column.

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

`ci.yml` calls `migrate.yml` only after frontend, GitHub Pages build, backend,
security, and PostgreSQL migration checks pass for the same `main` commit. Migrations use
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

# Database Reference

Database reference for Ledger Sync 2.24.1.

Updated for the 2026-09-18 domain storage implementation. The current model
contains 34 application tables; Alembic also maintains its own version table.
This describes the source checkout, not a confirmation of production deployment.

For every column, default, key, relationship, index and source-code link, see
the [complete schema dictionary](DATABASE_SCHEMA_REFERENCE.md). Its
[JSON inventory](DATABASE_SCHEMA_REFERENCE.json) and
[model-derived PostgreSQL DDL](DATABASE_MODEL_SCHEMA.sql) document the same
source snapshot, with live-verification limits stated explicitly.

## Runtime Databases

| Environment | Database |
| --- | --- |
| Local development and tests | SQLite |
| Hosted production | Neon PostgreSQL 17 through PgBouncer |

SQLAlchemy 2 is the shared ORM. Alembic owns schema migrations. Production is
already PostgreSQL; it is not a future migration target.

Primary files:

```text
backend/src/ledger_sync/db/
  base.py
  session.py
  models.py                 Re-export facade
  _models/
    enums.py
    user.py
    transactions.py
    analytics.py
    investments.py
    planning.py
    organization.py
    ai_usage.py
    analytics_state.py
    ledger_dimensions.py
    ai_settings.py
    compensation.py
  migrations/
    env.py
    versions/
```

Application code imports model types through `ledger_sync.db.models`. New
models belong in the appropriate `_models/*.py` domain module and must be
re-exported through `_models/__init__.py` and `models.py`.

## Table Inventory

### Identity and preferences

| Table | Purpose |
| --- | --- |
| `users` | OAuth identity, profile, active state, and token revocation version |
| `user_preferences` | Fiscal year, income/category rules, display, planning, and notification settings |
| `user_ai_settings` | AI mode, provider, model, encrypted personal key, and token limits |
| `audit_logs` | User-scoped import and analytics audit records |
| `ai_usage_log` | Provider, model, token, round, and cost usage |

### Ledger and organization

| Table | Purpose |
| --- | --- |
| `transactions` | Active and soft-deleted income, expense, and transfer ledger rows |
| `ledger_accounts` | Stable user-owned account identities, classification, closure, and credit limit |
| `ledger_account_aliases` | Exact lowercased source labels mapped to account identities |
| `ledger_categories` | Stable user-owned category identities |
| `ledger_subcategories` | Subcategory identities qualified by owner and parent category |
| `transaction_tags` | User-owned tags attached to transactions |
| `import_logs` | File hash idempotency and reconciliation counts |
| `column_mapping_logs` | Parser column-mapping diagnostics |
| `categorization_rules` | Ordered pattern-based category rules |
| `saved_filter_views` | Named transaction filter objects |

### Persisted analytics

| Table | Purpose |
| --- | --- |
| `daily_summaries` | Daily income, expenses, net, counts, and top category |
| `monthly_summaries` | Monthly income, expense, transfer, savings, and comparison totals |
| `category_trends` | Monthly category and subcategory aggregates by transaction type |
| `cohort_spending` | Day-of-week, day-of-month, and month-of-year spending cohorts |
| `transfer_flows` | All-time aggregates for each account pair |
| `merchant_intelligence` | Merchant totals, activity span, and recurring signal |
| `fy_summaries` | Fiscal-year income, expense, tax, investment, and savings totals |
| `net_worth_snapshots` | Daily asset, liability, and net-worth snapshots |
| `investment_holdings` | Ledger-derived investment principal and value |
| `analytics_state` | Input and published versions, dirty dates, and refresh status per user |

### Planning and review

| Table | Purpose |
| --- | --- |
| `recurring_transactions` | Detected or manually created recurring patterns |
| `scheduled_transactions` | Expected future transactions |
| `anomalies` | Detected outliers and review state |
| `budgets` | Category budget limits and current tracking |
| `financial_goals` | Goal target, progress, status, and dates |
| `tax_records` | Imported or calculated fiscal-year tax records |
| `salary_plans` | One typed compensation plan per owner and fiscal year |
| `rsu_grants` | User-owned grants with preserved public grant IDs |
| `rsu_vestings` | Individually identified vesting events belonging to an owner's grant |

## Transaction Model

`transactions.transaction_id` is a 64-character SHA-256 hexadecimal primary
key. Every row also carries a required `user_id`.

Important columns:

| Column | Meaning |
| --- | --- |
| `transaction_id` | Stable public ID; never rewritten by categorization |
| `source_fingerprint`, `fingerprint_version` | Versioned, occurrence-aware source identity |
| `user_id` | Owning user |
| `date` | Transaction timestamp |
| `amount` | `NUMERIC(15, 2)`, finite and between zero and 9,999,999,999,999.99 |
| `currency` | Source currency, constrained to `INR`; conversion is display-only |
| `type` | `Income`, `Expense`, or `Transfer` |
| `account` | Primary account |
| `category`, `subcategory` | Classification |
| `from_account`, `to_account` | Transfer legs |
| `account_id`, `from_account_id`, `to_account_id` | User-qualified references to ledger accounts |
| `category_id`, `subcategory_id` | User-qualified references to category dimensions |
| `note` | Optional description |
| `source_file` | File or manual-entry source that introduced the row |
| `last_seen_at` | Last reconciliation timestamp |
| `is_deleted` | Soft-delete flag |
| `created_at`, `updated_at` | Row timestamps |

### Transaction ID generation

New imports use SHA-256 over a canonical JSON array containing the version
domain, user, date, amount, account, note, source category/subcategory, type,
explicit transfer destination, source currency, and occurrence number. JSON
preserves field boundaries even when source labels contain `|`. Strings retain
the existing trimmed/lowercased hash normalization, amounts use two decimal
places, and dates use ISO 8601.

Capture this fingerprint **before** applying categorization rules. The initial
fingerprint also supplies a new row's public ID, but subsequent category edits
change neither the ID nor the source fingerprint. Occurrence numbers preserve
legitimate identical rows. A unique `(user_id, source_fingerprint)` index enforces
source idempotency.

Historical IDs remain unchanged. Existing rows initially have a NULL source
fingerprint and version 1. Re-imports verify legacy field matches before
adopting version 2. When an old categorization rule discarded source labels,
the importer accepts only an exact, unambiguous one-to-one economic match.
Ambiguous legacy duplicates reject the entire snapshot without moving tags or
anomaly reviews. Do not replace this migration bridge with fuzzy matching.

Dimension keys use exact Python lowercasing, not fuzzy or Unicode casefold
merging. Original labels remain on transactions for compatibility and audit.
The five dimension columns are nullable for legacy-writer compatibility; current
import and manual-create paths populate them in batches.

### Reconciliation

For each authenticated user:

1. Normalize incoming rows.
2. Lock the owning user, capture source fingerprints, then apply rules.
3. Resolve dimension IDs and source identities with bounded batch queries.
4. Insert unknown sources or update existing rows without changing public IDs.
5. Refresh `last_seen_at` and restore a matching soft-deleted row.
6. Mark active rows not seen in the current import as deleted.
7. Record changed dates and commit the ledger, import log, and analytics version
   together. A forced re-import updates the existing unique file log.

The unseen-row sweep is user-wide, not limited to one `source_file`. Transfer
pairs use separate reconciliation logic so incoming and outgoing source rows
become one `Transfer` record.

### Transaction indexes

The current composite indexes are optimized for user-scoped access:

```text
(user_id, date)
(user_id, type, date)
(user_id, category)
(user_id, account)
(user_id, from_account)
(user_id, to_account)
```

These six indexes are partial indexes over live rows. New migrations also remove
four duplicate index pairs and the redundant net-worth date index, while adding
the uniqueness needed for source identities and tenant-qualified relationships.
PostgreSQL predicates use `is_deleted IS false` to match the SQLAlchemy queries.
Native PostgreSQL 17.11 plans showed that the previous `= false` predicate was
not selected for these `IS false` queries; equivalent boolean expressions are
not automatically interchangeable for partial-index planning.
Do not add an index for every column: additional indexes also tax every write.

Date pagination orders by `(date, transaction_id)`. The transaction endpoint
accepts a signed `cursor` bound to the authenticated user, effective filters,
exclusions, and sort direction. It returns `next_cursor` while retaining offset
pagination and exact totals. Cursors are continuations, not frozen snapshots;
intervening edits can move rows across a page boundary.

## Analytics publication

`analytics_state` tracks ledger, preference, and algorithm versions separately
from the last published versions. Writers lock the user before reading or
mutating inputs and invalidate analytics in that same transaction. Refreshes
take the same lock before loading inputs and publish all results in one commit.
This prevents a stale worker from overwriting newer results.

`refresh_analytics()` skips an unchanged generation on the same IST day.
Otherwise it rebuilds affected daily summaries and affected monthly summaries
plus their following month, whose comparison values depend on the changed
month. Other analytics domains still rebuild from one shared active-ledger load.
Unknown change scope, preference changes, algorithm changes, or an oversized
dirty-day set request a full rebuild. `run_full_analytics()` remains an explicit
recovery operation. `/api/analytics/v2/freshness` exposes publication status.

## User Preferences Storage

`user_preferences` holds ordinary settings, with one row per owner. Historical
databases may also contain an anonymous empty default row created before
authentication existed. Migrations never infer an owner for configured data.
Several small structured settings remain JSON serialized into `TEXT` columns,
then converted to typed objects by the API.

JSON-in-text fields include:

- Essential categories
- Investment account mappings
- Taxable, investment-return, non-taxable, and other income categories
- Enabled anomaly types
- Fixed-expense categories
- Excluded accounts
- Growth assumptions

Do not query these fields as normalized relational data. Update them through
the preference API or serialize valid JSON in application code.

AI keys are stored only as encrypted ciphertext in
`user_ai_settings.ai_api_key_encrypted`. Ordinary preference queries do not read
this table. Current v2 writes use AES-256-GCM and HKDF-SHA256 with
`LEDGER_SYNC_ENCRYPTION_KEY`. Legacy PBKDF2 v1 ciphertexts are read-only
compatibility data and are upgraded on reveal.

### Account and compensation storage

`ledger_accounts` is the authority for account type, closure date and credit
limit. An unset type or limit is NULL; an explicit zero limit remains zero.
Limits use `NUMERIC(15,2)`. Existing aliases continue to resolve to the same
account, and every transaction retains its original label snapshot and ID.
The old `account_classifications` table is retired after backfill verification.

`salary_plans` is unique by `(user_id, fiscal_year)`. `rsu_grants` preserves the
existing grant ID in `public_id`, unique within its owner. `rsu_vestings` has
stable event IDs and an owner-qualified grant foreign key. Identical events
remain separate occurrences. Salary and RSU decimals use unscaled PostgreSQL
`NUMERIC`; SQLite uses exact decimal text rather than binary floats.

The preferences API still assembles `credit_card_limits`, `salary_structure`
and `rsu_grants` in their existing shapes. Vesting objects additionally expose
an optional `id`, which clients should return on subsequent edits. Services
validate writes; the preference coordinator owns the user lock, transaction
and analytics invalidation. A transaction-only reset preserves these domains.
A full reset clears them and creates fresh ordinary and AI defaults.

These boundaries remove duplicated account settings, isolate AI credentials
from ordinary reads, and allow compensation records to be changed independently.
They do not guarantee lower latency for every endpoint: assembling all
preferences now reads multiple domains. Compensation reads use three queries
regardless of grant count, and account settings use batched identity lookups.

### Coordinated deployment

The revision chain is `account_settings_2026` -> `ai_settings_2026` ->
`compensation_records_2026` -> `domain_storage_cutover_2026`. The first three
copy source values, and the final revision checks equivalence before removing
nine obsolete preference columns and the old classification table. Conflicting
identities, invalid decimals, configured orphan rows, or changed copies stop
the migration; they are not silently repaired.

Run PostgreSQL migration and ownership tests before release. Quiesce old
writers, take a recoverable backup/Neon branch, run the migration, deploy the
matching backend, and verify preference edits, imports, AI configuration and
resets before reopening traffic. The existing CI job now includes both domain
migration suites and exact-decimal PostgreSQL tests. Automated migration alone
does not coordinate old server instances; an old backend cannot run against
the final schema. There is no automatic downgrade after new domain writes.

Implementation and verification status:
[domain storage plan](plans/2026-09-18-domain-storage.md).

## User Scoping and Cascades

All user-owned operational and analytics tables include `user_id`.
`column_mapping_logs` is parser diagnostic data and is the notable
non-user-scoped table.

User foreign keys use `ON DELETE CASCADE` in the current model. Important
secondary relationships include:

- Tags and anomalies reference `(user_id, transaction_id)` together, so they
  cannot point at another user's transaction; hard deletion cascades.
- Dimension references include the owner, and subcategory references also
  include their parent category.
- Scheduled items reference `(user_id, recurring_id)` together. Detection
  clears references before replacing unconfirmed patterns, preserving schedules.
- Budget and category-trend uniqueness explicitly covers NULL subcategories;
  fiscal-year, merchant, and import identities are also unique per user.
- User account deletion explicitly clears domain rows before deleting the
  user, while database cascades provide defense in depth.

Every API query must still filter by the authenticated user. A cascade does not
replace authorization.

## Common ORM Patterns

### Read active rows for one user

```python
from sqlalchemy import select

from ledger_sync.db.models import Transaction

statement = (
    select(Transaction)
    .where(
        Transaction.user_id == current_user.id,
        Transaction.is_deleted.is_(False),
    )
    .order_by(Transaction.date.desc(), Transaction.transaction_id.desc())
)
transactions = session.execute(statement).scalars().all()
```

### Insert a user-owned row

```python
from ledger_sync.db.models import SavedFilterView

view = SavedFilterView(
    user_id=current_user.id,
    name="Large food purchases",
    filters='{"category":"Food","min_amount":5000}',
)
session.add(view)
session.commit()
session.refresh(view)
```

### Update only an owned row

```python
from sqlalchemy import select

from ledger_sync.db.models import FinancialGoal

goal = session.execute(
    select(FinancialGoal).where(
        FinancialGoal.id == goal_id,
        FinancialGoal.user_id == current_user.id,
    )
).scalar_one_or_none()

if goal is not None:
    goal.current_amount = new_amount
    session.commit()
```

Never look up a user-owned row by its public ID alone.

## Sessions and Connection Pooling

`db/session.py` creates one SQLAlchemy engine and a `SessionLocal` factory.
Request dependencies yield a session, commit only when pending changes exist,
roll back on failure, and always close.

SQLite settings:

- `check_same_thread=False`
- WAL journal mode
- Foreign keys enabled
- Normal synchronous mode
- In-memory temporary storage

PostgreSQL defaults are sized for the Neon free tier:

| Setting | Default |
| --- | --- |
| Pool size | 5 |
| Max overflow | 3 |
| Pool recycle | 300 seconds |
| Connect timeout | 10 seconds |
| Statement timeout | 30 seconds |
| Idle transaction timeout | 60 seconds |
| Pre-ping | Enabled |

Connection URLs beginning with `postgresql://` or
`postgresql+psycopg2://` are normalized to psycopg 3.

Relevant environment variables:

```text
LEDGER_SYNC_DATABASE_URL
LEDGER_SYNC_DATABASE_ECHO
LEDGER_SYNC_DB_POOL_SIZE
LEDGER_SYNC_DB_MAX_OVERFLOW
LEDGER_SYNC_DB_POOL_RECYCLE_SECONDS
LEDGER_SYNC_DB_CONNECT_TIMEOUT_SECONDS
LEDGER_SYNC_DB_STATEMENT_TIMEOUT_SECONDS
LEDGER_SYNC_DB_IDLE_TRANSACTION_TIMEOUT_SECONDS
```

## Database-Agnostic Date SQL

Use the helpers in `core/query_helpers.py`:

```python
from ledger_sync.core.query_helpers import fmt_date, fmt_month, fmt_year, fmt_year_month

period = fmt_year_month(Transaction.date)
```

They select SQLite `strftime` or PostgreSQL `to_char` behavior. Directly using
one database's date function can pass local tests and fail in production.

## Initialization and Migrations

Application startup does not issue schema DDL. Run Alembic before starting the
application. A development-only `LEDGER_SYNC_DB_BOOTSTRAP_ON_STARTUP=true` option
can create missing tables from metadata, but it cannot evolve existing schema
and is rejected outside development.

Migration location:

```text
backend/src/ledger_sync/db/migrations/versions/
```

Run commands from `backend/`:

```bash
# Inspect current revision
uv run alembic current

# Apply every pending revision
uv run alembic upgrade head

# Create a reviewed migration after changing model metadata
uv run alembic revision --autogenerate -m "add example field"

# Show the chain
uv run alembic history
```

Review every autogenerated revision before applying it. Verify:

- Table and column names
- Nullability and server defaults
- Foreign-key cascade behavior
- PostgreSQL and SQLite compatibility
- Backfill order before making columns non-null
- Index creation and removal

### Downgrade warning

Unsupported historical downgrades now raise an error. The Alembic environment
checks the entire rollback plan before any revision changes the schema or
version marker, including plans that start with a reversible step.

Before production schema work:

1. Inspect the target revision's `downgrade()` function.
2. Take a database backup.
3. Prefer a forward corrective migration.
4. Restore and validate the backup in an isolated database when a downgrade
   cannot recover the prior state. Never stamp past a failed migration.

See
[`MIGRATION_NOTES.md`](../backend/src/ledger_sync/db/migrations/MIGRATION_NOTES.md)
for the concise warning.

## Production Migration Automation

`.github/workflows/ci.yml` calls the reusable `migrate.yml` only after frontend,
backend, security, and PostgreSQL migration checks pass for a `main` commit.
The migration succeeds before that commit's Pages deployment starts. Main
releases and migrations serialize without canceling an active migration.

The workflow uses a direct Neon endpoint in the `LEDGER_SYNC_DATABASE_URL`
GitHub Actions secret. The application uses its separately configured pooler
endpoint. Vercel production promotion remains an external gate; see
[DEPLOYMENT.md](DEPLOYMENT.md). Model changes without a matching migration do
not evolve existing columns or constraints.

The migration suite builds isolated SQLite and PostgreSQL databases, compares
key and constraint semantics with the ORM, and exercises uniqueness, cascades,
amount checks, preserved data, and rollback rejection. PostgreSQL tests require
`LEDGER_SYNC_TEST_POSTGRES_URL` to point to a local disposable database named
`ledger_sync_test*`; they create and remove their own uniquely named schemas.

Revision `identity_constraints_2026` repairs OAuth uniqueness on SQLite and
removes global uniqueness on month, merchant, fiscal-year, and import-hash
fields. It preserves the user-scoped monthly uniqueness rule and adds the
positive budget/goal checks. Duplicate OAuth owners or nonpositive existing
amounts stop the revision before changes; resolve those records explicitly
instead of merging accounts or rewriting amounts automatically.

The September chain proceeds through `schema_integrity_2026`,
`stable_import_identity_2026`, `analytics_versions_2026`,
`ledger_dimensions_2026`, `transaction_invariants_2026`, and
`scheduled_references_2026`, followed by `live_index_predicates_2026`.
Preflight checks stop on duplicate keys, invalid
financial values, orphan references, or cross-user references; they do not
silently rewrite financial history. Dimension backfills preserve existing
transaction IDs and annotations.

For SQLite table rebuilds, use the Alembic command's dedicated connection.
Relevant revisions refuse a connection with foreign keys enabled because a
parent-table rebuild could otherwise cascade-delete child records. The
migrations validate foreign keys after rebuilding; application connections
continue enforcing them. Never toggle foreign-key enforcement inside an active
transaction to bypass this guard.

Deploy this chain and its matching backend as one coordinated release. Once
version-2 imports exist, rolling back to a legacy writer is unsafe even though
the new columns are additive. Test a restored database or Neon branch first.

The final PostgreSQL index revision takes an exclusive transaction-table lock
and replaces the six existing index definitions atomically, preserving their
names and key columns. Reads and writes wait until commit; rehearse the entire
upgrade against representative data and drain transaction traffic for rollout.
Failure rolls back all replacements. SQLite is unchanged by that revision.

## Backup and Recovery

For production, use Neon branch, point-in-time restore, or PostgreSQL backup
facilities. Do not copy a live PostgreSQL data directory.

For local SQLite:

```bash
sqlite3 ledger_sync.db ".backup ledger_sync.backup.db"
sqlite3 ledger_sync.db "PRAGMA integrity_check;"
```

Before restoring, stop local writers and preserve the current file until the
replacement has been verified.

## Source of Truth

When this guide and code differ, use this order:

1. Alembic revisions for the deployed schema history
2. SQLAlchemy metadata under `db/_models/`
3. API schemas and serializers
4. This guide

Related references:

- [API](API.md)
- [Calculations](CALCULATIONS.md)
- [Development](DEVELOPMENT.md)
- [Deployment](DEPLOYMENT.md)

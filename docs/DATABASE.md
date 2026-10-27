# Database Reference

Database reference for Ledger Sync 2.31.0.

Updated for the 2026-09-18 domain storage implementation and the 2026-10-27
feature domains revision. The current model contains 49 application tables;
Alembic also maintains its own version table. This describes the source
checkout, not a confirmation of production deployment.

For every column, default, key, relationship, index and source-code link, see
the [complete schema dictionary](DATABASE_SCHEMA_REFERENCE.md). Its
[JSON inventory](DATABASE_SCHEMA_REFERENCE.json) and
[model-derived PostgreSQL DDL](DATABASE_MODEL_SCHEMA.sql) document the same
source snapshot, with live-verification limits stated explicitly. All three
are generated; regenerate them after a model change with
`uv run --directory backend python scripts/build_schema_reference.py`
([script](../backend/scripts/build_schema_reference.py)).

## Runtime Databases

| Environment | Database |
| --- | --- |
| Local development and tests | SQLite |
| Hosted production | Neon PostgreSQL 17 through PgBouncer |

SQLAlchemy 2 is the shared ORM. Alembic owns schema migrations. Production is
already PostgreSQL; it is not a future migration target.

Semantic search stores its embeddings with pgvector on PostgreSQL, so the
`vector` extension must exist before `transaction_embeddings` is created.
`feature_domains_2026` runs `CREATE EXTENSION IF NOT EXISTS vector` (Neon ships
pgvector on every plan), and a `before_create` hook does the same for
`metadata.create_all`. SQLite keeps the same vectors as little-endian float32
bytes and ranks them with numpy.

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
    upload_tokens.py
    push_subscriptions.py
    balance_checks.py
    bank_alerts.py
    category_overrides.py
    external_refs.py
    saved_view_pins.py
    tax_deductions.py
    tax_ais.py
    rsu_tax.py
    mf_holdings.py
    transaction_embeddings.py
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
| `upload_tokens` | Hashed, revocable, single-scope access tokens for automations: Money Manager upload, MCP read access and the bank-alert inbox |
| `push_subscriptions` | Web Push devices that receive a user's alerts, one browser or Home Screen app per row |
| `audit_logs` | User-scoped import and analytics audit records |
| `ai_usage_log` | Provider, model, token, round, and cost usage |

### Ledger and organization

| Table | Purpose |
| --- | --- |
| `transactions` | Active and soft-deleted income, expense, and transfer ledger rows |
| `ledger_accounts` | Stable user-owned account identities, classification, closure, credit limit, and the Money Manager group, card days and paying account |
| `ledger_account_aliases` | Exact lowercased source labels mapped to account identities |
| `ledger_categories` | Stable user-owned category identities |
| `ledger_subcategories` | Subcategory identities qualified by owner and parent category |
| `transaction_tags` | User-owned tags attached to transactions |
| `import_logs` | File hash idempotency and reconciliation counts |
| `column_mapping_logs` | Parser column-mapping diagnostics |
| `categorization_rules` | Ordered pattern-based category rules |
| `saved_filter_views` | Named transaction filter objects |
| `saved_view_pins` | Saved views pinned to the Dashboard watchlist (user, view, position); unique per user and view; removed with the view or the user through `ON DELETE CASCADE` |
| `balance_checks` | User-entered bank or card balances per account and day, compared with the ledger on every read |
| `bank_alerts` | Parsed bank SMS and email alerts (hashes and parsed fields, never the text), matched against ledger rows on every read |
| `transaction_embeddings` | Opt-in semantic-search vectors of transaction text: pgvector on PostgreSQL, float32 bytes on SQLite |

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
| `recurring_transactions` | Detected or manually created recurring patterns, with the detected amount and an optional user-set amount |
| `scheduled_transactions` | Expected future transactions; today written only by the Money Manager import (repeat rules) |
| `anomalies` | Detected outliers and review state |
| `category_overrides` | Review-queue decisions per transaction: kept, or moved to the user's category, which every import puts back |
| `budgets` | Category budget limits and current tracking |
| `financial_goals` | Goal target, progress, status, and dates |
| `external_refs` | Links a row an import created (a scheduled transaction or a budget) to its source UID, with a fingerprint of the values last written |
| `tax_records` | Imported or calculated fiscal-year tax records |
| `tax_deductions` | Old-regime deduction amounts saved per owner, tax year and section |
| `tax_ais_summaries` | Per-tax-year totals imported from the AIS (TDS on salary, other TDS, interest, dividends), one row per owner and tax year, replaced on re-import |
| `salary_plans` | One typed compensation plan per owner and fiscal year |
| `rsu_grants` | User-owned grants with preserved public grant IDs |
| `rsu_vestings` | Individually identified vesting events belonging to an owner's grant |
| `rsu_vest_fx` | How each vest's perquisite becomes rupees: the employer's figure, an SBI TT buying rate, or the ECB approximation; one record per vest |
| `foreign_asset_events` | User-entered sales (from a vest) and dividends of RSU shares, in the stock's currency, for Schedule FA |

### Investments from statements

| Table | Purpose |
| --- | --- |
| `mf_holdings` | One scheme per folio or demat account from the latest CAS of each issuer kind: units, cost, statement NAV and period; no PDF, password, PAN or investor details |
| `mf_transactions` | Dated CAMS or KFintech statement rows per holding (type, signed amount, units, NAV, unit balance), used for XIRR and first-in-first-out cost |
| `mf_nav_prices` | Public AMFI NAV cache keyed by `isin:` or `code:` lookup key, for held schemes only; not user data, and `checked_at` drives the once-a-day refresh |

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

A Money Manager backup also supplies each row's own UID, stored as
`(source_system, source_uid)` with a unique per-user index. That identity is
matched first: the stored row with the UID is updated in place (amount, date,
account, note and labels included) and keeps its public ID. A row without a UID
yet is adopted when its fingerprint matches, or once, when its date, amount,
account, type and transfer ends occur exactly once on both sides. Because an
edited row keeps its ID while its content fingerprint moves, the reconciler
clears a fingerprint before handing it to another row, and gives a new row a
derived ID when an older row already holds its fingerprint as an ID. `occurred_at`
keeps the source's time of day; `date` stays the ledger day.

Dimension keys use exact Python lowercasing, not fuzzy or Unicode casefold
merging. Original labels remain on transactions for compatibility and audit.
The five dimension columns are nullable for legacy-writer compatibility; current
import and manual-create paths populate them in batches.

### Reconciliation

For each authenticated user:

1. Normalize incoming rows.
2. Lock the owning user, capture source fingerprints, apply rules, then
   re-apply review-queue category changes (`category_overrides`) to the rows
   the reconciler will pair them with: a source UID first, then the
   fingerprint, then a verified legacy ID. The import's own label is kept on
   the override for Undo, and a row whose source type changed loses its
   override.
3. Resolve dimension IDs and source identities (source UIDs first, then
   fingerprints and verified legacy IDs) with bounded batch queries.
4. Insert unknown sources or update existing rows without changing public IDs.
5. Refresh `last_seen_at` and restore a matching soft-deleted row.
6. Mark active rows not seen in the current import as deleted.
7. Put each review-queue change back on any live row that reconciliation gave
   another label (a row paired by shape, which step 2 cannot predict), keeping
   the import's label for Undo.
8. Record changed dates and commit the ledger, import log, and analytics version
   together. A forced re-import updates the existing unique file log.

The unseen-row sweep is user-wide, not limited to one `source_file`. Transfer
pairs use separate reconciliation logic so incoming and outgoing source rows
become one `Transfer` record. Steps 2 and 7 do nothing while
`category_overrides` does not exist yet, so a backend served before the
migration still imports. A `keep` decision never changes a label, and applying
categorization rules to existing transactions skips rows with a change
override. A Money Manager backup also writes its repeat rules and monthly
budgets before the commit, in a savepoint so a failure there leaves the ledger
import intact, linked through `external_refs` (see Feature Domain Tables).

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
recovery operation. `/api/analytics/v2/data-health` reports
`rollups_calculated_at` and `rollups_stale` (rollups older than the latest
import).

The refresh also rebuilds anomaly findings. It replaces the open rows in
`anomalies` and the rows the engine dismissed itself (auto-dismiss: reviewed
and dismissed, `reviewed_at` NULL, `review_notes` starting `Auto-dismissed: `),
and keeps the rows a user reviewed, which also suppress the same finding later.
`user_preferences.anomaly_types_enabled` picks the checks: unset, or exactly the
four-type default, runs every check.

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
this table. Current writes use the authenticated `ls-byok:v3:` envelope
(AES-256-GCM, HKDF-SHA256 with `LEDGER_SYNC_ENCRYPTION_KEY`). Legacy PBKDF2 v1
and HKDF v2 ciphertexts are read-only compatibility data and are rewrapped to
v3 when a Bedrock call or key reveal reads them.

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

## Feature Domain Tables

Revision `feature_domains_2026` adds 14 tables in one expand-only step. Each
is user-scoped except `mf_nav_prices`.

- **Ledger checks.** `balance_checks` holds what a bank or card app showed for
  one account on one IST day (signed `NUMERIC(15, 2)`, unique per user,
  account and day). The ledger side is never stored: every read recomputes the
  account's running balance at the end of that day, so an import that fills in
  missing rows can turn a mismatch into a match. `bank_alerts` holds a parsed
  bank SMS or email alert without its text. `text_hash` makes a redelivery a
  no-op, `ref_hash` folds the SMS and email copies of one payment (direction
  is part of that unique key, so a refund quoting the original reference stays
  a separate credit), and the account survives only as its last four digits.
  Alerts are matched against live transactions on every read, never become
  ledger rows or analytics inputs, and are capped at 500 new alerts per user in
  any 24 hours, counted in the database.
- **Review decisions.** `category_overrides` keeps one decision per user and
  transaction, keyed by the public transaction ID as `transaction_tags` is. A
  `change` is applied again by every import (see Reconciliation); a `keep`
  only records the review.
- **Import links.** `external_refs` links a Money Manager repeat rule (kind
  `repeat_rule`, a `scheduled_transactions` row) or monthly budget (kind
  `budget`, a `budgets` row) to its source UID. `local_id` is not a foreign key
  because the kinds live in different tables, and `fingerprint` hashes the
  columns the import last wrote. An import updates a linked row only while it
  still matches, so an edit made in Ledger Sync is kept; a linked row deleted
  in Ledger Sync comes back while the backup still has the item; a row with no
  link was made by hand and is never changed. The import skips repeat rules
  and budgets while the table does not exist yet.
- **Watchlist.** `saved_view_pins` orders the saved views pinned to the
  Dashboard. `position` is deliberately not unique, so a reorder rewrites every
  row in one pass, and the API allows eight pins per user. Only the watch tiles
  read a view's `filters` on the server.
- **Tax and RSU records.** `tax_deductions` keeps positive old-regime amounts
  per tax year and 1961 Act section key; saving zero deletes the row.
  `tax_ais_summaries` keeps four totals per tax year from an AIS decrypted in
  the browser, so no PAN, date of birth or statement row reaches the server.
  `rsu_vest_fx` records how one vest becomes rupees (`fx_source` is derived on
  every write: the employer's figure, else an SBI TT buying rate, else the ECB
  approximation) and `foreign_asset_events` holds the user's sales and
  dividends in the stock's own currency. Their decimals use
  `CompensationDecimal`. None of these four is an analytics input.
- **Statements.** `mf_holdings` and `mf_transactions` hold the latest CAS
  import of each issuer kind (CAMS and KFintech, or NSDL and CDSL); a new
  import replaces its kind inside one transaction that locks the user.
  `mf_nav_prices` caches AMFI's NAVs for the schemes held. It has no `user_id`,
  and `GET /api/mf-holdings` downloads the NAV file on demand only when a held
  scheme's NAV was checked before the latest 10:30 IST.
- **Devices.** `push_subscriptions` holds one row per browser or Home Screen
  app. The endpoint is unique, so a device belongs to one user at a time, and
  `alert_keys` (a JSON list in `TEXT`) records what the daily run already told
  the device, so a repeated run sends nothing new.
- **Semantic search.** `transaction_embeddings` holds one 512-dimension Titan
  Text Embeddings V2 vector per opted-in transaction, built from the text
  `note | category | subcategory | account` (never amounts or dates).
  `text_hash` covers the model, the dimensions and the text, so only new or
  changed rows are embedded again. Search is an exact scan filtered by
  `user_id` (pgvector `<=>` on PostgreSQL, numpy cosine on SQLite) with no
  approximate index, so no tenant shares an index with another; the unique
  `(user_id, transaction_id)` index is the B-tree behind the scan. Every
  embedding call is reserved and settled in `ai_usage_log` under the provider
  `bedrock-embed`. A soft-deleted transaction keeps its vector but is never
  searched or counted.

Other 2.31.0 features add no table or column. The Dashboard reads
(`/api/dashboard-metrics`, `/api/weekly-recap`, `/api/safe-to-spend`,
`/api/card-cycles`) only read existing ledger, account, preference, recurring,
schedule and anomaly rows; card cycles use the Money Manager account columns
that `money_manager_source_2026` added to `ledger_accounts`. Budget edits use
the existing `budgets` columns, and the partial unique indexes still count
paused rows, so creating a budget for a paused category resumes that row.
Category suggestions train in process memory from `transactions` and are
rebuilt when the ledger version changes. The Fee or Interest anomaly check
needed no migration (see Production Migration Automation).

What each reset clears:

| Table | Transactions-only reset | Full reset |
| --- | --- | --- |
| `balance_checks`, `bank_alerts`, `tax_deductions`, `tax_ais_summaries`, `rsu_vest_fx`, `foreign_asset_events`, `mf_holdings`, `mf_transactions` | Kept | Cleared |
| `saved_view_pins` | Kept | Cleared with its views |
| `external_refs` | `repeat_rule` links cleared with their schedules; `budget` links kept | Cleared |
| `category_overrides`, `transaction_embeddings` | Cleared with the transactions (cascade) | Cleared |
| `push_subscriptions` | Kept | Kept |
| `mf_nav_prices` | Not user data | Not user data |

Deleting the account runs the full reset path and then removes the user, so
the user foreign keys cascade through the rest, `push_subscriptions` included.
Reset and delete skip a table whose migration has not run yet, so they keep
working on a database that predates `feature_domains_2026`.

## User Scoping and Cascades

All user-owned operational and analytics tables include `user_id`.
`column_mapping_logs` (parser diagnostics) and `mf_nav_prices` (public AMFI
NAVs) are the non-user-scoped tables.

User foreign keys use `ON DELETE CASCADE` in the current model. Important
secondary relationships include:

- Tags, anomalies, category overrides and semantic-search embeddings reference
  `(user_id, transaction_id)` together, so they cannot point at another user's
  transaction; hard deletion cascades, so a ledger reset or account deletion
  removes them. Soft deletion does not invoke foreign-key cascades.
- `rsu_vest_fx` and `foreign_asset_events` reference `rsu_vestings(id)` alone,
  because that table has no unique `(user_id, id)`; every writer checks that
  the vest belongs to the same user. Deleting a vest cascades to its
  `rsu_vest_fx` record and sets `foreign_asset_events.vesting_id` to NULL, so
  its sales stay.
- `saved_view_pins` cascades from `saved_filter_views`, and `mf_transactions`
  from `mf_holdings`.
- `external_refs.local_id` names a row in the table its `kind` selects and is
  not a foreign key. An import re-points a link whose row was deleted and
  removes it once the source item is gone too.
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
GitHub Pages build, backend, security, and PostgreSQL migration checks pass for
a `main` commit.
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

Revision `orm_schema_alignment_2026` follows `domain_storage_cutover_2026` and
aligns a migration-built schema with the ORM without rewriting data. It counts
NULLs in every column it would tighten first and stops, changing nothing, if
any exist; nothing is backfilled or deleted. It then sets NOT NULL on the 118
columns migrations left nullable (plus `import_logs.user_id` where
`reconcile_create_all_2026` left it nullable), creates 10 missing ORM indexes,
and drops duplicate or legacy-named indexes only when an equivalent plain index
is retained. Each step inspects the live schema and changes only what differs.
`user_preferences.user_id` stays nullable on purpose. Current writers already
supply every tightened value, so deploying the backend before the migration is
safe. PostgreSQL holds ACCESS EXCLUSIVE locks on the affected tables with a 10s
lock timeout; SQLite rebuilds `users`, `transactions` and
`recurring_transactions` under the dedicated-connection rule above. The
revision is irreversible: recover with a verified backup or a forward repair.

Revision `feature_domains_2026` follows `money_manager_source_2026` and creates
the 14 tables in Feature Domain Tables. It only creates tables, so the running
backend and the next one both work before and after it. Each table is skipped
when it already exists with the expected columns (a `create_all` bootstrap made
it), and any other shape stops the revision before a change. On PostgreSQL it
sets a 10 second lock timeout, since creating a table locks nothing but the
brief foreign-key reference, and runs `CREATE EXTENSION IF NOT EXISTS vector`
first when `transaction_embeddings` is missing. It is irreversible: dropping
the tables would discard the checks, decisions, deductions, RSU records, pins,
devices and imported holdings users entered, so recover with a verified backup
or a forward repair.

Vercel deploys the backend outside this job chain, so the backend can be live
before the migration. Imports, the Money Manager repeat-rule and budget step,
rule application, resets and account deletion skip a table that does not exist
yet. The routes behind the other new tables (balance checks, bank alerts, push,
saved deductions and AIS totals, RSU tax records, CAS holdings, semantic search
and the Dashboard watchlist) fail with a server error on PostgreSQL until it
runs, so apply the migration before or with the backend, as the `migrate` job
does ahead of the Pages deployment. The native PostgreSQL CI job installs
`postgresql-<major>-pgvector` from apt.postgresql.org for its cluster's own
major and checks that `vector.control` exists before the migration suite runs.

Rolling back the backend to 2.30.x needs one cleanup first.
`anomalies.anomaly_type` holds the `AnomalyType` member name in `VARCHAR(50)`,
so the new `FEE_CHARGE` check needed no migration, but a build without that
member fails to load such a row. Run
`DELETE FROM anomalies WHERE anomaly_type = 'FEE_CHARGE'` before running an
older build.

After an upgrade, `uv run alembic check` reports no differences between the
migrated schema and the ORM. `migrations/env.py` filters only the documented
dialect noise, by exact name: six ORM enums stored as VARCHAR, three unique
indexes that stand in for same-named unique constraints (dropped only as a
matched pair), and the nullable `user_preferences.user_id`. Every other
difference still fails the check, and CI runs it after the SQLite bootstrap and
the PostgreSQL CLI upgrade.

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

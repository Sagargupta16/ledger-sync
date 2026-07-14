# Database Reference

Database reference for Ledger Sync 2.22.0.

Verified against SQLAlchemy metadata and the Alembic chain on 2026-07-14.
The current model contains 26 tables.

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
| `user_preferences` | Fiscal year, classification, display, planning, salary, notification, and AI settings |
| `audit_logs` | User-scoped import and analytics audit records |
| `ai_usage_log` | Provider, model, token, round, and cost usage |

### Ledger and organization

| Table | Purpose |
| --- | --- |
| `transactions` | Active and soft-deleted income, expense, and transfer ledger rows |
| `transaction_tags` | User-owned tags attached to transactions |
| `import_logs` | File hash idempotency and reconciliation counts |
| `column_mapping_logs` | Parser column-mapping diagnostics |
| `account_classifications` | Account name to account type mapping |
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

### Planning and review

| Table | Purpose |
| --- | --- |
| `recurring_transactions` | Detected or manually created recurring patterns |
| `scheduled_transactions` | Expected future transactions |
| `anomalies` | Detected outliers and review state |
| `budgets` | Category budget limits and current tracking |
| `financial_goals` | Goal target, progress, status, and dates |
| `tax_records` | Imported or calculated fiscal-year tax records |

## Transaction Model

`transactions.transaction_id` is a 64-character SHA-256 hexadecimal primary
key. Every row also carries a required `user_id`.

Important columns:

| Column | Meaning |
| --- | --- |
| `transaction_id` | Deterministic occurrence-aware hash |
| `user_id` | Owning user |
| `date` | Transaction timestamp |
| `amount` | `NUMERIC(15, 2)` positive amount |
| `currency` | Currency code, default `INR` |
| `type` | `Income`, `Expense`, or `Transfer` |
| `account` | Primary account |
| `category`, `subcategory` | Classification |
| `from_account`, `to_account` | Transfer legs |
| `note` | Optional description |
| `source_file` | Last importing file name |
| `last_seen_at` | Last reconciliation timestamp |
| `is_deleted` | Soft-delete flag |
| `created_at`, `updated_at` | Row timestamps |

### Transaction ID generation

The normalized hash input is:

```text
user_id
| date
| amount
| account
| note
| category
| subcategory
| type
| occurrence when greater than zero
```

Values are trimmed and lowercased where applicable. Amounts use two decimal
places and dates use ISO 8601.

The first identical row uses occurrence zero and preserves the original hash
shape. Later identical rows in the same import append occurrence 1, 2, and so
on before hashing. This keeps legitimate duplicate transactions instead of
silently collapsing them.

### Reconciliation

For each authenticated user:

1. Normalize incoming rows.
2. Build deterministic IDs.
3. Insert unknown IDs.
4. Update changed category, subcategory, note, or type values.
5. Refresh `last_seen_at` and restore a matching soft-deleted row.
6. Mark active rows not seen in the current import as deleted.

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

Single-column legacy transaction indexes were removed because authenticated
queries always include `user_id`.

## User Preferences Storage

`user_preferences` is one row per user. Several structured settings are JSON
serialized into `TEXT` columns, then converted to typed objects by the API.

JSON-in-text fields include:

- Essential categories
- Investment account mappings
- Taxable, investment-return, non-taxable, and other income categories
- Enabled anomaly types
- Credit-card limits
- Fixed-expense categories
- Excluded accounts
- Salary structure
- RSU grants
- Growth assumptions

Do not query these fields as normalized relational data. Update them through
the preference API or serialize valid JSON in application code.

AI keys are stored only as encrypted ciphertext in
`ai_api_key_encrypted`. Current v2 writes use AES-256-GCM and HKDF-SHA256 with
`LEDGER_SYNC_ENCRYPTION_KEY`. Legacy PBKDF2 v1 ciphertexts are read-only
compatibility data and are upgraded on reveal.

## User Scoping and Cascades

All user-owned operational and analytics tables include `user_id`.
`column_mapping_logs` is parser diagnostic data and is the notable
non-user-scoped table.

User foreign keys use `ON DELETE CASCADE` in the current model. Important
secondary relationships include:

- `transaction_tags.transaction_id` cascades with its transaction.
- `anomalies.transaction_id` cascades when the referenced transaction is
  hard-deleted.
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
    .order_by(Transaction.date.desc())
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

Application startup calls `Base.metadata.create_all()`. This creates missing
tables for a fresh local database, but it does not evolve existing columns,
constraints, or indexes. Alembic remains required for schema upgrades.

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

Downgrade support is mixed. Early and some intermediate migrations implement
real reversals, while many newer revisions intentionally use a no-op
`downgrade()`. Never assume `alembic downgrade -1` is safe.

Before production schema work:

1. Inspect the target revision's `downgrade()` function.
2. Take a database backup.
3. Prefer a forward corrective migration.
4. Restore the backup when a no-op or destructive downgrade cannot recover the
   prior state.

See
[`MIGRATION_NOTES.md`](../backend/src/ledger_sync/db/migrations/MIGRATION_NOTES.md)
for the concise warning.

## Production Migration Automation

`.github/workflows/migrate.yml` runs `alembic upgrade head` on pushes to
`main` when any of these paths change:

```text
backend/alembic/**
backend/src/ledger_sync/db/migrations/**
backend/src/ledger_sync/db/models.py
backend/src/ledger_sync/db/_models/**
```

The workflow uses the `LEDGER_SYNC_DATABASE_URL` GitHub Actions secret. Model
changes without a matching migration are not sufficient to evolve production
tables.

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

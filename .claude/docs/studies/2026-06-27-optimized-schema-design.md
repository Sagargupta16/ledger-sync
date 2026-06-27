# Optimized Schema Design (from scratch) — 2026-06-27

## TL;DR

A clean-slate, analytics-first schema for ledger-sync grounded in the
[db-sql-patterns skill] research (Postgres/Neon, Kimball star schema,
app-maintained rollups) and the **real data profile**: 1 user, 6,768 active
transactions (18,371 incl. soft-deleted), 132 categories / 189 category::sub /
30 accounts / 115 transfer pairs / 90 months / 7-year span, 24 read-heavy pages.

**Core idea:** a `transactions` *fact* table (the grain = one ledger line) +
small *dimension* tables (account, category, import) + a complete set of
*pre-aggregated rollup* tables that are recomputed **incrementally on upload**,
so every page reads a summary, never scans raw transactions. The current schema
is ~80% there; this documents the optimal end-state and the gaps.

This is a DESIGN study. Migrating the live DB is incremental + needs Neon
`idx_scan` data — see "Rollout". No schema changed yet.

## Why this matters (the real cost today)

**25 frontend pages/components call `useTransactions()`** — they pull all 6,768
rows to the browser and compute analytics in JS (cohort, quick-insights,
health-score, returns, GST, tax). The backend already has rich rollups
(daily/monthly/category/FY/transfer/merchant/networth) but the frontend largely
bypasses them. The biggest win is **serving every page from a rollup endpoint**,
not shipping the raw ledger to the client.

## Layer 1 — Dimensions (small, denormalized, surrogate-keyed)

```
users(id PK, email, ...)                              -- exists
account_dim(id PK, user_id FK, name, type,            -- NEW: replaces per-row
            is_investment, investment_type,              account strings + the
            is_liquid, currency, archived)               account_classifications +
                                                          investment_account_mappings
category_dim(id PK, user_id FK, category, subcategory,-- NEW: replaces per-row
             tax_treatment, spend_class,                  category/subcategory text;
             gst_rate_pre, gst_rate_post)                 carries tax + GST + essential
import_dim(id PK, user_id FK, file_name, file_hash,   -- = import_logs (exists), used
           imported_at, row_count)                        as the dim for source_file
```

Why: today `account` (14 chars), `category`/`subcategory` (18), `source_file`
(30, only 12 distinct) are repeated as text across 18k rows, and tax/GST/essential
classification is scattered (prefs JSON + hardcoded maps). Folding them into
dimensions keyed by a small int FK shrinks the fact table, makes
"reclassify a category" a one-row dim update (not a per-transaction rewrite), and
gives the GST date-aware rates + tax treatment a single source of truth.

## Layer 2 — Fact table (the grain)

```
transactions(
  id              BIGINT PK,            -- surrogate int (NEW); shrinks every index/FK
  content_hash    CHAR(64) UNIQUE,      -- the sha256 dedup key (today's PK) becomes a UNIQUE col
  user_id         FK -> users (CASCADE, indexed, NOT NULL),
  account_id      FK -> account_dim,    -- replaces account text
  category_id     FK -> category_dim,   -- replaces category/subcategory text
  import_id       FK -> import_dim,     -- replaces source_file text
  txn_date        DATE NOT NULL,        -- DATE not microsecond DATETIME (all are midnight)
  amount          NUMERIC(15,2) NOT NULL,  -- additive measure, positive magnitude
  type            SMALLINT NOT NULL,    -- enum int: 0 income / 1 expense / 2 transfer
  from_account_id FK -> account_dim,    -- transfer leg
  to_account_id   FK -> account_dim,
  note            TEXT,
  deleted_at      TIMESTAMPTZ NULL,     -- soft delete as a timestamp (enables aging/purge)
  last_seen_at    TIMESTAMPTZ,
  created_at, updated_at
)
```

Indexes (equality-first, partial on live rows):
- `(user_id, txn_date) WHERE deleted_at IS NULL` — primary analytics range scan
- `(user_id, type, txn_date) WHERE deleted_at IS NULL` — type-filtered rollups
- `(user_id, category_id) WHERE deleted_at IS NULL`
- `(from_account_id)`, `(to_account_id)` — transfer flows
- `UNIQUE(content_hash)` — dedup
- Drop the rest (today's 12 → ~6). The current `(user_id,date)` + `(date,type)`
  are prefixes/non-scoped and redundant; `category_subcategory` non-scoped.

Wins vs today: int PK shrinks every secondary index; `deleted_at` partial indexes
keep the 63% dead rows out of hot scans; DATE drops the inclusive-end-of-day
gymnastics; FK dims remove ~60 chars of repeated text/row.

## Layer 3 — Rollups (recomputed incrementally on upload; pages read these)

Existing (keep, all verified consistent vs raw SQL): `daily_summaries`,
`monthly_summaries`, `category_trends`, `fy_summaries`, `transfer_flows`,
`merchant_intelligence`, `net_worth_snapshots`, `investment_holdings`,
`anomalies`, `recurring_transactions`.

**Gaps to add so NO page scans raw transactions:**
```
quick_insights_cache(user_id, period_key, ...)   -- the Dashboard "Quick Insights"
                                                    band + fun-facts (cashback, peak
                                                    day, weekend split, age-of-money,
                                                    days-of-buffering, burn rate)
cohort_spending(user_id, dimension, bucket, avg) -- day-of-week / day-of-month /
                                                    seasonal averages (occurrence-
                                                    correct divisors, see calc study)
health_score_snapshot(user_id, computed_at,      -- financial-health metrics over a
                       income_cv_12m, ...)           rolling 12-month window
gst_summary(user_id, fy, slab, spend, gst)       -- date-aware GST per FY/slab
returns_summary(user_id, account_id, invested,   -- per-investment-account P&L
                current_value, xirr)
```
Each is user-scoped, carries `computed_at`, and is refreshed by the on-upload
pipeline for ONLY the affected periods.

## Layer 4 — On-upload compute pipeline (the "calculated when someone uploads")

Today `POST /api/analytics/v2/refresh` recomputes summaries synchronously after
upload (replaced the flaky BackgroundTasks). Optimal plan:

1. **Ingest** rows → upsert into `transactions` (dedup by `content_hash`),
   resolve/create `account_dim` / `category_dim` / `import_dim`.
2. **Determine the dirty window** — the min/max `txn_date` and the set of
   (months, FYs, categories, accounts) the upload touched.
3. **Incrementally recompute ONLY those buckets** of each rollup (not all-time):
   daily/monthly for touched months, category_trends for touched cat×month,
   fy_summaries for touched FYs, transfer_flows/merchant/holdings/networth as
   needed, then the Layer-3 caches (insights, cohort, health, gst, returns).
4. **All aggregation in SQL** (`GROUP BY`), never Python loops over rows.
5. Stamp each rollup row `computed_at`; serve pages straight from rollups.

This bounds recompute cost to the upload size, not the 7-year history, and lets
the frontend drop `useTransactions()` for everything except the Transactions
page itself (which should use **keyset pagination**, not load all 6,768).

## What stays the same (don't "fix")
- Decimal `NUMERIC(15,2)` for money — correct.
- `query_helpers.py` dialect-aware date formatting + shared user-scope filter.
- The `_models/` facade + layered api/core/db.
- Empty-downgrade migration convention.

## Rollout (incremental, safe on Neon — do NOT big-bang)
1. **Cheap wins first** (own PRs): index prune (confirm via Neon
   `pg_stat_user_indexes.idx_scan` first), `deleted_at` + partial indexes +
   purge job, `source_file` → `import_id` FK.
2. **Frontend**: migrate the heaviest `useTransactions()` pages to rollup
   endpoints; add the Layer-3 cache tables + their on-upload compute.
3. **Bigger, staged**: `txn_date` DATE, surrogate int PK + `content_hash` UNIQUE,
   account/category dimensions — each its own migration with a backfill and a
   read/dedup audit. Use `server_default`+backfill for NOT NULL adds; guard
   `CREATE INDEX CONCURRENTLY` to the Postgres dialect.
4. Every step: verify money + dialect SQL against **Postgres**, not just SQLite.

## Sources
Grounded in `~/.claude/skills/db-sql-patterns/SKILL.md` (live-cited Postgres/Neon/
Alembic/SQLAlchemy/Kimball/Stripe research, 2026-06-27) + the real-data profile
measured from `backend/ledger_sync.db`. Companion: the calc-verification study.

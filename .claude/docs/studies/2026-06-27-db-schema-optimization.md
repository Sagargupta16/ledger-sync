# DB Schema & Storage Optimization Study — 2026-06-27

## TL;DR

The schema is sound and well-normalized; the wins are about **index bloat,
soft-delete accumulation, and a few storage/typing choices** — not a redesign.
Evidence is from the real DB (`backend/ledger_sync.db`, 14.4 MB, user_id=1).
Prod is **Neon Postgres** (free tier, 0.5 GB), so storage + connection cost
matter more there than on local SQLite.

Highest-value, lowest-risk changes, in order:
1. **Prune redundant transaction indexes** (12 → ~6). Several are prefixes of
   composites and never independently used.
2. **Purge / archive soft-deleted rows** (63% of `transactions` are
   `is_deleted=1`: 11,603 of 18,371) — they bloat the table and every index.
3. **Drop dead/always-constant columns** where safe (`currency` is always INR;
   `source_file` is a 500-char string repeated across all rows, 12 distinct).
4. Minor: store `date` as DATE not DATETIME-with-microseconds; consider a
   shorter surrogate key alongside the 64-char hash.

None are urgent correctness issues — they're efficiency + tidiness.

## Evidence (real numbers)

| Table | Rows | Indexes | Note |
|---|---|---|---|
| transactions | 18,371 (6,768 active / 11,603 deleted) | **12** | the hot table |
| daily_summaries | 1,512 | 2 | pre-aggregated |
| category_trends | 1,153 | 4 | pre-aggregated (subcategory×month×type) |
| merchant_intelligence | 197 | 3 | |
| transfer_flows | 115 | 4 | |
| monthly_summaries | 90 | 4 | |
| net_worth_snapshots | 12 | 4 | |
| fy_summaries | 9 | 3 | |
| (5 tables: budgets, scheduled_transactions, tax_records, financial_goals, column_mapping_logs) | 0 | up to 5 | empty but indexed |

- `transactions` avg text-column lengths: `transaction_id`=64 (sha256 hex),
  `source_file`≈30 (max 500), `category`≈18, `account`≈14, `note`≈13,
  `date`=26 chars (DATETIME w/ microseconds, always `00:00:00.000000`).
- `currency`: **1 distinct value (INR)** across all rows.
- `source_file`: **12 distinct** values, stored per-row as VARCHAR(500).
- DB file: 14.4 MB; ~63% of the transactions table is dead (soft-deleted) rows.

## The 12 transaction indexes (overlap analysis)

```
sqlite_autoindex_transactions_1        (PK transaction_id)        -- keep
ix_transactions_user_date_type (user_id,date,type)               -- keep (primary analytics scan)
ix_transactions_user_date      (user_id,date)                    -- REDUNDANT prefix of ^ (drop)
ix_transactions_user_deleted   (user_id,is_deleted)              -- low selectivity; folded below
ix_transactions_user_type_deleted (user_id,type,is_deleted)      -- keep (type+deleted filter)
ix_transactions_user_category  (user_id,category)                -- keep (category analytics)
ix_transactions_category_subcategory (category,subcategory)      -- non-user-scoped; rarely used alone (drop or make user-scoped)
ix_transactions_date_type      (date,type)                       -- non-user-scoped; prefix-covered by user_date_type (drop)
ix_transactions_account        (account)                         -- keep (holdings/account lookups) — ideally user-scoped
ix_transactions_from_account   (from_account)                    -- keep (transfer flows)
ix_transactions_to_account     (to_account)                      -- keep (transfer flows)
ix_transactions_last_seen_at   (last_seen_at)                    -- only used by reconcile soft-delete sweep; keep if that path is hot, else drop
```

Recommended set (~6-7): PK, `(user_id,date,type)`, `(user_id,type,is_deleted)`,
`(user_id,category)`, `from_account`, `to_account`, and `account`. Drop
`user_date` (prefix), `date_type` (prefix + non-scoped), `category_subcategory`
(non-scoped, low independent use), and reconsider `user_deleted` (covered by
`user_type_deleted` for most queries) and `last_seen_at`.

Why it matters: every index is rewritten on each insert and consumes storage;
on a 18k-row table with 63% dead rows, 12 indexes is ~2x what the query mix
needs. On Neon this is write amplification + storage against the 0.5 GB cap.

## Recommendations

### 1. Index pruning (low risk, measure first)
- Before dropping, confirm with `EXPLAIN QUERY PLAN` on the real read paths
  (analytics_v2 reads hit pre-aggregated tables, so transaction indexes mostly
  serve the *refresh* recompute + search/export). On Postgres use
  `pg_stat_user_indexes.idx_scan` to find zero-scan indexes empirically — do
  this on prod before dropping, since local SQLite has no usage stats.
- Each drop is a one-line Alembic migration; reversible by re-adding.

### 2. Soft-delete lifecycle (biggest storage win)
- 11,603 of 18,371 rows are `is_deleted=1`. Soft-delete is correct for the
  re-upload/reconcile flow, but rows that have been deleted for > N days (e.g.
  90) and aren't referenced can be hard-purged in a periodic job. Add a
  `deleted_at` timestamp (currently there's only the boolean) so a purge job can
  age them out. Alternatively `VACUUM` after large reconciles to reclaim pages.
- Every analytics recompute and every index carries these dead rows today.

### 3. Storage / typing
- **`currency`**: 1 distinct value (INR). Keep the column (multi-currency is a
  product goal) but it adds no value yet; no action, just noted.
- **`source_file` VARCHAR(500), per row, 12 distinct**: normalize into
  `import_logs` (which already exists, 11 rows) and store `import_log_id` FK on
  the transaction instead of the repeated string. Saves ~30 chars × 18k rows and
  makes "rows from this import" a join, not a string scan.
- **`date` DATETIME with microseconds, always midnight**: the time component is
  meaningless here (all `00:00:00.000000`). Storing as DATE avoids the
  inclusive-end-of-day filter gymnastics (see calc-verification study) and is
  smaller. Larger change — schedule behind a migration + filter audit.
- **`transaction_id` VARCHAR(64) sha256 PK**: the content hash is load-bearing
  for dedup (good), but it's also the PK that every index and any FK repeats. A
  surrogate integer PK with the hash as a UNIQUE column would shrink secondary
  indexes substantially. Medium effort; weigh against the dedup code that keys
  on the hash.

### 4. Empty-but-indexed tables
- `budgets`, `scheduled_transactions`, `tax_records`, `financial_goals`,
  `column_mapping_logs` have 0 rows but carry indexes. Harmless; no action.

### 5. Pre-aggregated tables (V2) — keep
- `daily_summaries`/`monthly_summaries`/`category_trends`/`fy_summaries`/
  `transfer_flows`/`merchant_intelligence` are the read-path cache that makes the
  dashboard fast on serverless. They're derived (recomputed on upload), so
  they're a deliberate space-for-speed trade, not redundancy. Keep. (They were
  all verified consistent vs raw SQL in the calc-verification study.)

## What NOT to change
- The layered `_models/` split + facade — clean, keep.
- User-scoping (`user_id` FK + index on every user table) — non-negotiable, keep.
- The V2 pre-aggregation tables — they're the perf strategy, not bloat.
- Decimal `NUMERIC(15,2)` for money — correct (never float).

## How to act safely on Neon (prod)
1. Run `SELECT * FROM pg_stat_user_indexes WHERE relname='transactions' ORDER BY idx_scan;`
   on prod to find zero/low-scan indexes (local SQLite can't tell you this).
2. Drop the confirmed-unused ones in one Alembic migration (empty downgrade per
   project convention; re-add is trivial if a query regresses).
3. Add `deleted_at` + a monthly purge of long-dead soft-deletes; `VACUUM`/
   `pg_repack` to reclaim.
4. Defer the `date`-as-DATE and integer-PK changes — bigger blast radius; do them
   as their own PRs with a filter/dedup audit.

## Status
Study only — no schema changes applied yet (they need prod `idx_scan` data and
their own migrations). This doc is the reference; implement incrementally.

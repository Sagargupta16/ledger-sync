# PostgreSQL live-index correction: measured results

Revision `live_index_predicates_2026` corrects all six PostgreSQL live-index
predicates from `is_deleted = false` to `is_deleted IS false`. The application
already uses SQLAlchemy `.is_(False)`. PostgreSQL 17.11 did not use these partial
indexes for that application predicate before the correction. After the actual
migration, the same captured SQL and parameters used the existing date index.

No index names, key columns, transaction rows, or API behavior change.
SQLite retains `is_deleted IS 0`; no SQLite schema rebuild occurs in 1600.
There is no added primary-key tie-breaker index.

## Frozen benchmark method

Measured on native PostgreSQL **17.11**, against one disposable schema containing
100,000 synthetic live transactions: two users with 50,000 rows each, 50 rows per
date per user over 1,000 dates. Page size was 100. Every note matched `purchase`;
50 rows per user also matched `rare`; no rows matched `unmatched`.

The existing `backend/tests/benchmark_transaction_pagination.py` was inspected
without editing it. The disposable equivalent reused the actual application's
`SearchFilters`, `_apply_search_filters`, `_apply_sorting`, `transaction_page`,
and cursor encoder. Both phases used the actual `IS false` filter. The first
phase used historical index predicates; the second followed execution and commit
of the new 1600 migration against the identical rows and schema.

Each variant received three warmup calls and 15 measured calls, with variant
order rotated. The ORM identity map was cleared outside each timed call so rows
were materialized afresh. Medians include database calls, ORM materialization,
cursor handling, and exact full-filter totals. They exclude HTTP, tags, filter
construction, and initial cursor-anchor acquisition. A cursor result measures
continuing traversal, not jumping to an arbitrary page for free.

Every timed result was checked for identical IDs and total. Exact count SQL and
parameters were identical across variants; the cursor's count never included
its seek boundary. Captured SQL, parameters, anchors, and totals also matched
between phases. Index-definition comparison verified that only the six
predicates changed.

The table received `VACUUM (ANALYZE)` after loading. Planner settings were
unmodified: `work_mem=4MB`, `max_parallel_workers_per_gather=2`,
`enable_incremental_sort=on`, `plan_cache_mode=auto`. No index or scan type was
forced. These are warm local measurements, not a production latency forecast;
the host was also available for other agents' validation.

## Request medians

Milliseconds, including exact total calculation:

| Case | Legacy count + offset, before → after | Current offset, before → after | Current cursor, before → after |
| --- | ---: | ---: | ---: |
| Date, offset 40,000 | 36.343 → 14.248 | 44.596 → 14.323 | 14.915 → 3.073 |
| `purchase`, offset 40,000 | 46.997 → 31.102 | 56.758 → 31.378 | 21.571 → 12.847 |
| Date, offset 40,025, inside a date group | 35.328 → 14.057 | 43.851 → 14.424 | 14.710 → 3.113 |
| `rare`, first page, 50 matches | 41.081 → 38.626 | 20.621 → 19.005 | Not applicable |
| `unmatched`, first page, zero matches | 42.162 → 39.552 | 21.425 → 19.629 | Not applicable |

Every deep-page request issued **two SQL queries, including one exact count**.
The legacy first-page requests also issued two queries. Current first-page
requests with 50 or zero matches issued **one query and no separate count**:
the complete short result proves the exact total. There is no approximate or
cached count in these measurements.

## Actual EXPLAIN findings

Both `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` and text plans were collected for
the captured application SQL, including count queries. The following are
representative individual instrumented executions, not request medians.

| Query | Before 1600 | After 1600 |
| --- | --- | --- |
| Date cursor page | `ix_transactions_user_id` scans 50,000 tenant rows, removes 40,000 at the boundary, then top-N sorts; 7.894 ms, 1,393 shared hits | Backward `ix_transactions_user_date` scan and incremental sort; 0.083 ms, 14 shared hits |
| Date exact count | Heap-reading `ix_transactions_user_id` scan of 50,000 rows; 6.403 ms, 1,393 shared hits | Index-only `ix_transactions_user_to_account` scan of 50,000 entries; 2.750 ms, 45 shared hits, zero heap fetches |
| `purchase` cursor page | Tenant index scan and top-N sort; 8.952 ms, 1,393 shared hits | Partial date index and incremental sort; 0.097 ms, 14 shared hits |
| `purchase` exact count | Tenant index scan checks all 50,000 rows; 12.111 ms, 1,393 shared hits | Same tenant scan/filter shape; 12.190 ms, 1,393 shared hits |
| Date cursor inside date group | Tenant scan and top-N sort; 7.537 ms, 1,393 shared hits | Partial date index and incremental sort; 0.081 ms, 12 shared hits |

All five after-migration observations above had zero shared-buffer reads.
Substring count still dominates its cursor request because the exact total
requires evaluating the substring filter across the tenant's matching scope.

The corrected date-cursor plan scanned 151 qualifying entries plus 50 entries
removed at the boundary, returning a 101-row lookahead page. It sorted three
small groups with a 37 KB peak. The boundary inside a date group scanned 126
qualifying entries plus 25 removed entries and used a 41 KB peak full-sort
workspace. This is evidence that the existing `(user_id, date)` index handles
the tested 50-row date groups efficiently even though ordering also uses the
primary key. It does not measure unusually large date groups or a hypothetical
additional index.

Before correction, deep offset plans used parallel sequential or bitmap scans
and external merge sorts spilling roughly 8 MB per worker. After correction,
they used the existing date index with incremental sorting, but still processed
roughly 40,100 entries to reach the page. Cursor traversal removes that offset
work; the exact count remains separate.

## Migration, parity, and release coordination

The seven new revisions form this chain:

| Time | Revision |
| --- | --- |
| 1000 | `schema_integrity_2026` |
| 1100 | `stable_import_identity_2026` |
| 1200 | `analytics_versions_2026` |
| 1300 | `ledger_dimensions_2026` |
| 1400 | `transaction_invariants_2026` |
| 1500 | `scheduled_references_2026` |
| 1600 | `live_index_predicates_2026` |

The 1600 migration is frozen and does not import runtime models. It acquires
`ACCESS EXCLUSIVE` on `transactions`, checks all six existing index definitions
before any replacement, then drops and recreates only indexes whose predicate
needs changing. Missing or unexpected definitions abort without automatic
repair. Already-corrected definitions are accepted. Ordinary transactional DDL
allows rollback to restore the original indexes; downgrade to 1500 restores the
old predicates using the same validation and lock.

**Coordinate a maintenance window and drain transaction traffic.** Use the
direct PostgreSQL migration connection. Ordinary index drops already require
this strong table lock; taking it explicitly makes the preflight and
replacement atomic with respect to schema changes. Reads and writes to the
table wait until the surrounding migration transaction commits. Existing long
transactions can delay lock acquisition. If the whole chain is applied in one
transaction, earlier revisions also contribute to its lock duration.

On the isolated 100,000-row benchmark schema, the actual six-index replacement,
including preflight and commit, took **231.856 ms** with no deliberate lock
contention. This is one local observation, not a production outage guarantee.
Rehearse on representative data and budget lock acquisition plus all index
builds and the surrounding transaction before release.

Focused tests in `test_live_index_predicates.py` verify:

- All six model predicates match compiled `.is_(False)` and migrated definitions
  on PostgreSQL and SQLite; names and columns remain identical.
- Live and soft-deleted rows, original IDs/labels, child tags, unrelated indexes,
  and the complete SQLite schema survive 1500 → 1600 unchanged.
- Missing, wrong-column, and wrong-predicate indexes fail preflight before any
  index OID changes.
- PostgreSQL rollback restores every original index OID; downgrade restores the
  old predicates.
- Actual application pagination plus exact count uses the partial date index
  with a selective date filter on 20,000 synthetic rows, without disabling
  sequential scans.

A source scan confirmed the transaction read filters in API queries, analytics,
rules, reconciliation, and metadata already use `.is_(False)`. Additional
category/account/type/date/amount/search predicates retain that live condition
and are compatible with the corrected indexes; which eligible index PostgreSQL
chooses still depends on selectivity. Historical migrations remain frozen.

Final migration-focused validation ran `test_live_index_predicates.py`,
`test_migrations_from_scratch.py`, and `test_ledger_dimensions_migration.py`
with the disposable native PostgreSQL URL enabled: **68 passed, 11 expected
dialect-specific skips**. The new predicate suite itself passed **9 tests with
5 PostgreSQL-only cases skipped on SQLite**. Focused Ruff checks and mypy passed.
Main independently confirmed the new suite and repository Ruff checks before
freezing source/tests for the full regression suite.

The benchmark schema was dropped and verified absent. The PostgreSQL cluster
was left running and responded with version 17.11 after cleanup. No production
tables were read.

Local detailed evidence is retained in
`backend/.cache/pg-pagination-review/final1600/results.json` and
`backend/.cache/pg-pagination-review/final1600/explain-plans.txt`; the disposable
driver is `backend/.cache/pg-pagination-review/freeze1600.py`. This report freezes
the measured medians and relevant plan details independently of those cache
files.

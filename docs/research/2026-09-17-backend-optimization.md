# Backend and schema optimization

Implemented locally on 17 September 2026. This builds on the
[schema research](2026-09-16-schema-review.md); production has not been changed.

## Design decisions

Keep Neon PostgreSQL and SQLAlchemy. This workload benefits from reliable
relational keys, bounded queries, and fewer unnecessary writes. It does not
currently justify a second database, sharding, a graph database, or an event
store. No production row counts or latency measurements were collected.

| Area | Implemented behavior |
| --- | --- |
| Upload identity | Versioned canonical JSON fingerprints captured before categorization; occurrence counts retain duplicates |
| Public transaction IDs | Existing IDs, tags, and anomaly references survive category edits and verified legacy adoption |
| Account/category data | Four user-owned dimension tables, batched resolution, and original labels retained as snapshots |
| Financial correctness | Decimal amounts, explicit INR ingestion, database checks, and Decimal transfer-trend accumulation |
| Integrity | NULL-aware budget/category keys, per-user business keys, and owner-qualified foreign keys |
| Indexes | Remove duplicate/redundant indexes and correct the existing PostgreSQL live predicates to match real queries |
| Reads | Signed date cursors, deterministic ordering, exact totals, and SQL aggregate responses without transaction hydration |
| Analytics | Durable input/publication versions, same-user serialization, dirty-day summary updates, and same-day no-op refresh |
| Async boundaries | Synchronous database routes and complete worker phases; provider I/O does not retain authentication connections |
| Startup | Alembic-managed schema; optional metadata bootstrap restricted to development |
| Lifecycle | Preserve scheduled items when their detected/manual source is removed; reset and deletion respect all new dependencies |

## Developer navigation

| Responsibility | Location |
| --- | --- |
| Request validation and HTTP response mapping | `backend/src/ledger_sync/api/` |
| Upload transaction and refresh coordination | `services/upload_service.py` |
| Bounded category/income SQL calculations | `services/calculation_service.py` |
| Account/category upsert and resolution | `services/ledger_dimensions.py` |
| Source fingerprints and verified legacy matching | `core/import_identity.py` |
| Source label canonicalization | `core/import_labels.py` |
| Snapshot persistence | `core/reconciler.py`, `core/reconciler_transfers.py`, `core/sync_engine.py` |
| Analytics invalidation and publication | `core/analytics/refresh.py`, `core/analytics/engine.py` |
| Public model imports | `db/models.py` |
| Historical schema evolution | `db/migrations/versions/` |

Paths below `services/`, `core/`, and `db/` are relative to
`backend/src/ledger_sync/`. Import consumers use the public model facade.

Every new ledger/preference writer must acquire the user lock before reading
mutable input, record invalidation in the same transaction, and include both old
and new dates for date changes. A successful upload commits independently of
analytics, allowing an analytics-only retry without importing twice.

## Measurements

These are synthetic local measurements, not a production latency promise.
Before/after paths use identical data and check equivalent responses. Results
vary with hardware, cache state, cardinality, and concurrent work.

| SQLite workload | Before median | After median |
| --- | ---: | ---: |
| Deep Next HTTP request, 100,000 rows | 33.79 ms | 8.64 ms |
| Deep substring Next HTTP request, 100,000 rows | 55.74 ms | 21.80 ms |
| Rare substring first page, isolated query | 65.02 ms | 35.30 ms |
| Category month history, 50,000 rows | 1,315.07 ms | 5.16 ms |
| Income analysis, 50,000 rows | 1,259.04 ms | 17.57 ms |

Pagination includes exact-count work and uses nine warm repetitions, with rows
split equally between two users. The HTTP comparisons include tags, preference
loads, worker dispatch, serialization, and compression, and use five SQL
queries each. They exclude real network latency, JWT validation, browser
rendering, and obtaining the preceding cursor. The rare-result comparison
isolates the database query. See [the pagination measurements](2026-09-17-transaction-crud-results.md)
for exact limits, offsets, and parity checks. Aggregate measurements use three
repetitions with tracing overhead. The old category and
income paths hydrate 45,000 and 50,000 transaction objects respectively; the new
paths hydrate zero. Their SQL returns aggregate groups. Normal application
startup issues zero schema statements instead of 31 metadata existence checks.

Reproduce from `backend/` using the installed project runtime:

```text
python tests/benchmark_transaction_pagination.py
python tests/benchmark_transaction_ui_path.py
python tests/benchmark_backend_boundaries.py
```

Read each benchmark's options before choosing dataset size. These scripts create
synthetic disposable databases, not the configured personal ledger.

Native PostgreSQL 17.11 measurement used 100,000 synthetic rows, two users,
50 rows per date, and 15 measured repetitions after warmup. Each request includes
an exact full-filter count and returns the same rows before and after:

| PostgreSQL workload | Previous count-and-offset path | Corrected indexes with cursor |
| --- | ---: | ---: |
| Deep date page, offset 40,000 | 36.34 ms | 3.07 ms |
| Deep substring page, offset 40,000 | 47.00 ms | 12.85 ms |
| Date boundary inside a group, offset 40,025 | 35.33 ms | 3.11 ms |

The actual migrated schema now lets the planner use its existing partial date
index. Before migration, PostgreSQL ignored that index for the application's
different boolean expression and scanned/sorted a much larger tenant result.
These measurements exclude HTTP, tags, and cursor-anchor acquisition. They do
not predict production latency. The [PostgreSQL report](2026-09-17-postgresql-live-index-results.md)
contains identical-query comparisons isolating the index fix, complete query
plans, buffer counts, and migration lock timing.

## Validation and rollout

Final verification on the completed seven-revision change:

| Check | Result |
| --- | --- |
| Complete backend suite with native PostgreSQL 17.11 enabled | 1,487 passed; 17 expected dialect-specific skips |
| Complete frontend suite | 2,063 passed across 187 files |
| Backend Ruff lint and formatting | Passed across 285 Python files |
| Backend mypy using the project's configuration | Passed across 181 source files |
| Frontend ESLint and TypeScript | Passed |
| Frontend production build | Passed |
| Git whitespace/diff check | Passed |
| Updated PostgreSQL CI workflow | YAML validated; all 672 integration cases collected |

The final backend suite ran after all source and test changes were frozen.
Tests use disposable databases; the production schema and personal ledger were
not migrated. Benchmark timings above are separate measurements, not CI latency
assertions.

Tests exercise populated upgrades from the previous schema through the new
revisions, not just fresh metadata. They cover preserved transaction columns,
soft-deleted history, tags and anomalies, budget uniqueness, cross-user failures,
scheduled references, source adoption, account reset, rollback, and query shape.
Native PostgreSQL 17.11 is tested in a disposable local database; SQLite remains
covered separately. Runtime tests include event-loop responsiveness, released
provider connections, OAuth phases, CORS error responses, and startup behavior.
The PostgreSQL CI job now runs the complete integration directory instead of
only the original migration test file.

Deploy the migrations and their matching backend as one coordinated release.
Use a Neon branch or restored database first. Preflight checks intentionally stop
on invalid amounts, duplicate business keys, or invalid ownership references;
they never silently merge owners or rewrite financial amounts.

The final index revision uses an exclusive PostgreSQL transaction-table lock
while atomically rebuilding its six live indexes. Reads and writes wait for
commit. Rehearse the complete chain with representative data, budget that
interval, and drain transaction traffic before rollout. No index key columns
or transaction rows change, and failed replacements roll back together.

Legacy imports cannot recover discarded source fields with certainty in every
case. Ambiguous matches abort atomically and preserve annotations for review.
After version-2 data has been written, use a forward corrective release or a
verified full restore; a legacy writer can regenerate incompatible identities.

## Deliberate limits

- Daily and monthly summaries update selectively; other analytics domains
  still rebuild after invalidation from a shared ledger load.
- Cursor pages are live continuations, not immutable snapshots across edits.
- Original labels remain alongside dimension IDs for compatibility and audit.
- Existing preference storage and IST/UTC persistence conventions are retained.
- Row-level security, preference-table splitting, full-text/trigram indexing,
  materialized views, and partitioning require measured workload or deployment
  evidence before adding their operational cost.
- No claim is made that all CRUD operations are universally fastest. Correct
  ownership and identity, response parity, reduced work, and measured latency
  are the acceptance criteria.

# Transaction CRUD, pagination and exact trends

Transaction query behavior and synthetic measurements, 17 September 2026.
See [the implementation report](2026-09-17-backend-optimization.md) for the
complete backend/schema change and final verification record.

## Delivered behavior

- Transaction list, all, search, CSV export and AI transaction search now use the selected primary order followed by the string transaction ID.
- Existing offset fields and numbered pages remain available. Date ordering in either direction also returns a signed, bounded continuation. The signature binds owner, effective filters, excluded accounts and sort direction. Equivalent no-op filters, type casing, signed zero and preference ordering are normalized.
- Cursor totals count the whole current filtered ledger, never just the rows after the cursor. Cursor offsets describe traversal progress; this is not snapshot pagination across external ledger mutations. An offset page whose exact total follows from its final rows avoids a count; an empty page past the end still counts.
- The actual Transactions page reuses the preceding fresh page's cursor for Next. Uncached numbered jumps and other sorts use offset. The existing query keys include filters, order and page size. Mutation/preference invalidation prevents reuse; session/upload cache clearing aborts pending requests. Rejected cursors fall back to offset once. Old API/demo responses without cursors still work.
- CSV export carries the selected table sort.
- All seven synchronous database handlers in `api/transactions.py` now use normal functions. HTTP tests verify that their SQL executes outside the ASGI event loop.
- Manual creation uses v2 source identity, both transfer accounts, dimension references and atomic analytics invalidation. Legacy lookup preserves the former manual hash encoding but verifies canonical fields before deduplicating ambiguous pipe hashes.
- Monetary values in `trends.py` remain Decimal through totals, averages, extrema, transfer flows and monthly monetary differences. Percentages convert to float only after exact monetary aggregation.

## Measurements

Generated 100,000 SQLite rows, split equally between two owners. Nine warm repetitions, rotating variant order. No speculative indexes were added.

### HTTP path used by the UI

The real `/api/transactions/search` route includes filter construction, owner/preferences loads, tags, exact counts, worker dispatch and response serialization/compression. JWT validation, real network transit, browser rendering and obtaining the preceding page are excluded. A component test clicks the actual Next and numbered buttons and checks the emitted search parameters.

Both variants return identical responses and execute **five SQL queries, including one identical full-scope count**.

| Navigation | Limit | Offset | Offset median | Cursor median |
|---|---:|---:|---:|---:|
| First Next | 10 | 10 | 8.074 ms | 8.156 ms |
| Deep Next | 10 | 40,010 | 33.790 ms | 8.636 ms |
| Deep Next, common substring | 10 | 40,010 | 55.737 ms | 21.798 ms |
| Deep Next, larger page | 100 | 40,100 | 37.131 ms | 10.474 ms |

The default-size deep page improved about 3.9 times; shallow navigation did not improve meaningfully. These are synthetic SQLite measurements, not PostgreSQL or browser latency claims.

### Isolated pagination comparison

The helper benchmark excludes HTTP, tags, filter construction and preceding-cursor acquisition. Every comparison checks identical row IDs and totals; count SQL and bound parameters must also match.

| Case | Previous count-first | Updated offset | Cursor with exact count |
|---|---:|---:|---:|
| Unfiltered offset 40,000 | 30.504 ms | 30.687 ms | 2.541 ms |
| Common substring offset 40,000 | 48.024 ms | 47.780 ms | 14.694 ms |
| Rare substring, first page | 65.017 ms | 35.295 ms | — |
| Missing substring, first page | 62.945 ms | 34.701 ms | — |

Deep variants each use two SQL queries and one count. Rare/missing first pages drop from two queries to one by inferring the exact total.

## Regression coverage

- Signed cursor boundaries, ownership, effective filter normalization, live totals, cancellation, invalidation, and rejected-cursor fallback.
- Actual Next and numbered-page button behavior, with old-server and demo compatibility.
- Manual source identity, explicit transfer destination, safe legacy duplicate checks, dimension references, and analytics invalidation.
- Full raw-field verification before legacy adoption, including separator collisions and sources that collapse to the same classification after rules.
- Reordered duplicate occurrences, preserved tags/anomaly reviews, and isolation of another user's rows.
- Database execution outside the event loop and exact Decimal trend calculations.

The categorization suite verifies stable public/source identities, unchanged tag
and anomaly references, distinct source rows with identical final classification,
ghosts without rehash collisions, one atomic bulk commit, expiry semantics,
rollback, and raw reupload idempotence. Focused frontend coverage contains 14
passing tests; the complete frontend run passes 2,063 tests with lint, type
checking, and production build checks. The implementation report records the
final combined backend validation.

Reproduce from `backend`:

```text
.venv/Scripts/python.exe -m pytest tests/integration/test_manual_transaction_identity.py tests/integration/test_transaction_pagination.py tests/integration/test_transaction_facets.py tests/integration/test_transaction_worker_boundary.py tests/integration/test_categorization_rules.py tests/unit/test_trends_decimal.py --basetemp=.cache/crud-integration-review -q --no-cov
.venv/Scripts/python.exe -m pytest tests/integration/test_import_identity_review.py --basetemp=.cache/crud-identity-review -q --no-cov
.venv/Scripts/python.exe tests/benchmark_transaction_pagination.py
.venv/Scripts/python.exe tests/benchmark_transaction_ui_path.py
```

Reproduce from `frontend`:

```text
node node_modules/vitest/vitest.mjs run src/hooks/api/__tests__/useTransactionPage.test.tsx src/pages/__tests__/TransactionsPage.pagination.test.tsx src/services/api/__tests__/transactionPagination.test.ts --maxWorkers=1 --pool=threads
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
```

## Files to review

Runtime:

```text
backend/src/ledger_sync/api/transactions.py
backend/src/ledger_sync/api/transaction_pagination.py
backend/src/ledger_sync/api/ai_tools_impl/transactions.py
backend/src/ledger_sync/core/analytics/trends.py
frontend/src/hooks/api/useTransactionPage.ts
frontend/src/pages/TransactionsPage.tsx
frontend/src/services/api/transactions.ts
```

Focused tests and benchmarks:

```text
backend/tests/integration/test_transaction_pagination.py
backend/tests/integration/test_manual_transaction_identity.py
backend/tests/integration/test_categorization_rules.py
backend/tests/integration/test_transaction_facets.py
backend/tests/integration/test_transaction_worker_boundary.py
backend/tests/integration/test_import_identity_review.py
backend/tests/unit/test_trends_decimal.py
backend/tests/benchmark_transaction_pagination.py
backend/tests/benchmark_transaction_ui_path.py
frontend/src/hooks/api/__tests__/useTransactionPage.test.tsx
frontend/src/pages/__tests__/TransactionsPage.pagination.test.tsx
frontend/src/services/api/__tests__/transactionPagination.test.ts
```

Report:

```text
docs/research/2026-09-17-transaction-crud-results.md
```

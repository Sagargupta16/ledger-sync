# Ledger Sync schema arrangement: research and recommendation

Research date: 2026-09-17. Application source inspected at `0467bc2`.

**Recommendation:** keep a relational ledger with stable account/category
identities, small structured settings documents where useful, and separate
calculated summary tables. Consolidate account metadata, isolate AI credentials,
and introduce child tables for independently managed financial records. Do not
split every settings section or merge all analytics into one generic table.

This document records the design recommendation at research time. The accepted
account, AI, and compensation changes are now implemented locally; see the
[2026-09-18 verification report](2026-09-18-domain-storage-verification.md).
Production performance and deployment remain unverified. The
[complete schema dictionary](../DATABASE_SCHEMA_REFERENCE.md) describes the
current application model.

## What “best” means

A suitable design must preserve financial meaning, prevent invalid references,
support the application's common reads and writes, and remain understandable to
developers. The smallest number of tables and the smallest number of columns per
table are not useful optimization targets.

The tradeoff is measurable: normalization can remove inconsistent duplicates and
simplify individual edits, while adding joins and migration work. Denormalized
read models can accelerate common reports, while requiring reliable refresh and
freshness handling. PostgreSQL and Microsoft guidance support choosing boundaries
from actual data relationships and usage, not an arbitrary column count. [S1], [S2], [S4].

## Rules for deciding table and column boundaries

| Rule | Meaning | Ledger Sync application |
| --- | --- | --- |
| State what one row represents | Define the entity or reporting grain before choosing columns. | One transaction, one account, one vesting event, and one monthly summary are different row meanings. |
| Start with normalization | Give each authoritative fact a clear home; remove repeating groups and dependencies on another entity's attributes. Third normal form is a useful baseline. | Account classification belongs to account identity. Multiple vestings belong in child records if independently managed. |
| Respect cardinality | One-to-many relationships need an expandable representation; independently referenced children benefit from their own keys. | `rsu_grants` to `rsu_vestings`; file identity to import attempts. |
| Split for meaningful access or lifecycle differences | Separate fields when they need different permissions, update patterns, histories, or independent operations. | AI configuration is a better split candidate than ordinary display toggles. |
| Merge when identity and lifecycle coincide | One-to-one data can share a table when it describes the same entity and needs no independent boundary. | Merge account classification into `ledger_accounts`, after validating existing label mappings. |
| Keep historical facts distinct from current facts | A label captured on an old transaction and an account's current name have different meanings. | Preserve historical transaction labels while using account IDs for current configuration. |
| Use JSON for coherent documents | PostgreSQL recommends manageable documents that form one business unit; JSON updates still lock the row. | Small filter/growth settings can remain documents. A large collection of independently editable vestings is a stronger relational candidate. |
| Keep different aggregate grains separate | Combining daily, monthly and yearly cells in one fact table makes interpretation and constraints harder. | Retain daily/monthly/FY summaries and separate category/flow groupings. |
| Enforce relationships and invariants | PK, UNIQUE, FK, NOT NULL and CHECK constraints express different guarantees. | Keep owner-qualified FKs, positive limits, import identity uniqueness and explicit deletion behavior. |
| Optimize the workload after arranging the data | Indexes and query plans depend on filters, ordering, selectivity and data volume. | Measure transaction lists, imports, edits, deletes and summary reads before claiming improvement. |

Sources: normalization [S1], document boundaries [S2], reporting grain [S3],
access-pattern separation [S4], constraints [S8], and query plans [S9].
The account/history recommendations are applications of those principles to this
project, not prescriptions for Ledger Sync from the source authors.

When decomposing an existing table, the migration must preserve every fact and
reconstruct the intended original record through its keys. A one-to-one child
needs a unique parent reference; a one-to-many child needs its own identity.
Joining only on a nonunique label can multiply or mismatch rows. Verify those
properties during backfill rather than assuming a split is automatically safe.

## Revised recommendation and concrete benefits

| Priority | Proposed arrangement | Benefit | Tradeoff and acceptance condition |
| --- | --- | --- | --- |
| First | Put `account_type`, `is_closed`, `closed_date` and the configured credit limit on `ledger_accounts`. Keep aliases as children. | One account identity owns its settings; renames no longer require matching settings by text. Exact numeric credit limits replace loosely typed JSON numbers. | Existing classifications and card labels must map unambiguously. Unconfigured values must stay distinguishable from zero/default values. |
| First | Extract `user_ai_settings`, keyed uniquely by `user_id`. Keep encrypted keys and provider configuration there. | Ordinary preference queries can omit credential material; AI configuration has a clearer service and authorization boundary. | Moving a secret does not secure it by itself. Encryption, restricted reads, safe serialization and appropriate grants remain necessary. Avoid joining it back into every preferences query. |
| Next, with individual editing/reporting | Introduce `salary_plans`, one row per user/FY under today's product contract. | A year can be validated and changed independently; stable monetary fields receive numeric types and constraints. | If users only load/save a tiny whole document, validated JSONB remains reasonable. Multiple employers or mid-year revisions would require a richer key than user/FY. |
| Next, with individual editing/reporting | Introduce `rsu_grants` and `rsu_vestings`. | Change one vesting event without replacing all grants; enforce quantities and parent ownership; query upcoming vestings directly. | Requires stable event IDs and API/UI updates. Preserve fractional net quantities and nullable unknown values; do not blindly use two decimal places for every financial quantity or price. |
| When attempt history is required | Separate `import_files` from `import_runs`; attach mapping diagnostics to runs. | One file can retain successful, failed and forced attempts, improving support and troubleshooting. | Do not fabricate attempts absent from existing logs. Decide how failed-run metadata survives a rolled-back ledger transaction. File metadata does not imply storing spreadsheet binaries in the database. |
| When monthly budget history is required | Keep user limits in `budgets`; put monthly facts in `budget_monthly_usage`. | Budget intent stays separate from period calculations; historical reporting becomes explicit. | Specify whether history uses the limit effective at the time. Store period limits if needed. Derive remaining amount/percentage unless caching has a measured purpose. |
| Keep | One `transactions` table for the current income/expense/transfer model, plus annotation children and identity dimensions. | Common filtering, pagination, reconciliation and reporting stay coherent. | New accounting requirements could justify a posting model later; this review establishes no such requirement. |
| Keep | Remaining small user preferences together. | Simple loading and atomic settings updates, with fewer joins. | Select only needed fields. Fifty-four columns alone is not evidence of a performance problem. |
| Keep | Existing daily/monthly/category/FY/flow summary tables and refresh state. | Dashboards can read prepared results at the appropriate grain. | Freshness, dependency invalidation and publication consistency must remain correct. |

For rule, budget and schedule references, continue replacing identity-by-label
with owner-qualified IDs where the relationship denotes an existing account or
category. Keep matching patterns as patterns: an account-name wildcard rule is
not the same fact as a resolved account ID.

## JSONB, ordinary columns, or child tables?

| Data shape | Preferred representation | Reason |
| --- | --- | --- |
| Amount, currency, date, status, ownership and frequently filtered identifiers | Typed columns | Direct validation, meaningful types and ordinary indexes. |
| Independently edited/referenced vesting events or import attempts | Child rows | Stable identity, per-record constraints and independent lifecycle. |
| Small saved-filter or growth-assumption document normally handled as a unit | JSONB in PostgreSQL, with a compatible SQLite representation | Flexible structure and valid JSON storage without excessive tables. |
| Relationships requiring foreign keys | Columns and relational tables | Do not bury the enforced identifier inside an opaque JSON string. |
| Historical account/category spelling | Explicit snapshot columns where required | Current display names cannot reconstruct what the source originally said. |

PostgreSQL documents that JSONB avoids repeated text parsing and supports
indexing, but has input conversion overhead. It validates JSON syntax, not the
complete business contract. Native JSONB is not automatically faster than typed
columns or beneficial enough to justify a GIN index on every settings document.
Use structured application validation and add JSON indexes only for demonstrated
query patterns. [S2]

## What improves performance, and what remains uncertain

The credible functional benefits are fewer inconsistent account references,
independent edits, clearer history and better-enforced financial constraints.
Latency and throughput gains remain hypotheses until benchmarked.

1. **Avoid fetching unused data.** The current preference helper selects the
   complete model. Projection/deferred loading is a smaller alternative to
   splitting solely to reduce returned fields.
2. **Use indexes that match actual queries.** For user-filtered transaction
   queries, a leading `user_id` followed by relevant filter/order keys is
   plausible. Evaluate each real query rather than applying the same index to
   every table. PostgreSQL 17 explains how leading equality and subsequent range
   conditions bound a B-tree scan. [S5]
3. **Preserve usable active-row indexes.** The query predicate must imply the
   partial-index predicate. The app's `is_deleted IS false` convention should
   stay consistent. [S6]
4. **Balance read gains against writes.** Every extra index requires maintenance.
   Updating/deleting rows may benefit from an index for locating them, while the
   index itself adds modification cost. Do not delete an integrity-enforcing
   unique index just because a short observation window shows no read scans. [S7]
5. **Keep joins and calls bounded.** Fetching a new child table separately for
   every transaction can create more overhead than the schema split saves.
   Shape queries and batching around the endpoint's needs.
6. **Do not assume splitting removes contention.** This app deliberately locks
   the same user row during ledger/settings changes and analytics refresh.
   Creating more tables leaves that shared lock unchanged. Any narrower locking
   design would require a separate correctness review.

Relevant source:

- [Preference loader and update helper](../../backend/src/ledger_sync/api/preferences_helpers.py)
- [User and AI configuration columns](../../backend/src/ledger_sync/db/_models/user.py)
- [Account classification](../../backend/src/ledger_sync/db/_models/transactions.py)
- [Salary and vesting validation](../../backend/src/ledger_sync/schemas/salary.py)
- [User locking and analytics versions](../../backend/src/ledger_sync/core/analytics/refresh.py)

## How to establish which arrangement is better

Use representative user sizes and the same resource configuration for baseline
and candidate measurements. Include both small and large ledgers; preserve
duplicate occurrences, annotations and different user owners in correctness
checks.

| Workload | Measure |
| --- | --- |
| Initial and next-page transaction reads; common filters | Endpoint p50/p95/p99 latency, query count, rows returned, query plan and buffer reads. |
| Initial import and forced unchanged re-import | Total duration, SQL statement count, writes, lock waits, and unchanged-ID/idempotency correctness. |
| Edit/delete/category change | Commit latency, lock wait, owner isolation, annotation preservation and summary invalidation. |
| Dashboard/summary reads | Endpoint latency and freshness/version consistency. |
| Individual salary/vesting edits | Updated rows, payload size, concurrent-edit behavior and precision preservation. |
| Schema/storage cost | Table/index sizes and maintenance overhead alongside query performance. |

Use PostgreSQL `EXPLAIN` to inspect plans and controlled `EXPLAIN (ANALYZE,
BUFFERS)` runs to inspect execution. ANALYZE executes the statement, so benchmark
writes in an isolated test database. Query-plan costs are estimates, not
end-to-end response times; PostgreSQL specifically notes that output conversion
and network transmission are outside those cost estimates. [S9]

Neon's `pg_stat_statements` exposes calls, total/mean time and other per-query
statistics. It does not itself provide endpoint p95/p99; those require request
timing/telemetry. Neon also documents that these statistics are lost when compute
suspends or restarts, so preserve measurement windows and distinguish warm
queries from compute wake-up behavior. [S10]

Accept a performance change only after comparing its read and write effects.
Keep correctness and maintainability benefits explicit even where latency is
unchanged. No benchmark was performed for this research note.

## Table splitting versus PostgreSQL schemas and partitions

These are different decisions:

- **Table design:** choose which facts and child records belong together.
- **PostgreSQL schemas:** namespaces such as `public`, `analytics` and `ops`.
  They organize names and privileges; moving a table to another namespace does
  not inherently speed up its queries. One database and the current namespace
  remain reasonable for this app. [S11]
- **Table partitioning:** divide one logical table into physical row subsets,
  often by date. PostgreSQL says the benefit depends on the application and
  usually becomes worthwhile for very large tables. There is no evidence here
  that Ledger Sync needs it now. [S12]
- **Sharding/separate databases:** a separate scale and operational decision.
  The access-pattern principles from Azure's partitioning guidance are useful,
  but its distributed-store scaling claims are not evidence that this project
  should distribute its database. [S4]

There is no universal algorithm that selects the best business schema.
Functional-dependency analysis and normalization guide logical decomposition;
query plans and benchmarks evaluate physical performance. Both depend on the
meaning of the data and the actual workload.

## Implementation sequence

Measure the current workload first. Then make small changes in this order:

1. Consolidate account configuration and complete trustworthy ID mappings.
2. Separate AI configuration and adjust readers so ordinary queries omit it.
3. Normalize salary/vesting collections where individual operations justify it.
4. Introduce import-attempt and budget-period history when those histories are
   part of the product contract.

For each change, add the new representation, backfill without guessing ambiguous
identities, verify equivalent financial results and ownership, switch readers
and writers, and remove obsolete storage only after compatibility checks.
Preserve public transaction IDs and historical source labels throughout.

## Sources examined

The recommendations are this review's synthesis. Source excerpts were retrieved
online on 2026-09-17; PostgreSQL documentation is pinned to version 17. Sources
describe principles and mechanisms, not benchmarks of this application.

[S1]: https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/access/database-normalization-description
[S2]: https://www.postgresql.org/docs/17/datatype-json.html
[S3]: https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/grain
[S4]: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
[S5]: https://www.postgresql.org/docs/17/indexes-multicolumn.html
[S6]: https://www.postgresql.org/docs/17/indexes-partial.html
[S7]: https://www.postgresql.org/docs/17/indexes-intro.html
[S8]: https://www.postgresql.org/docs/17/ddl-constraints.html
[S9]: https://www.postgresql.org/docs/17/using-explain.html
[S10]: https://neon.com/docs/extensions/pg_stat_statements
[S11]: https://www.postgresql.org/docs/17/ddl-schemas.html
[S12]: https://www.postgresql.org/docs/17/ddl-partitioning.html

1. [Microsoft: normalization fundamentals][S1]. Repeating groups, relationships
   and dependency problems; used for the first three normal forms.
2. [PostgreSQL 17: JSON types and document design][S2]. Relational/JSON coexistence,
   JSONB tradeoffs, predictable structures and row-lock scope.
3. [Kimball Group: grain][S3]. One meaning per aggregate row and separate fact
   tables for different grains.
4. [Azure Architecture Center: data partitioning guidance][S4]. Access-pattern,
   lifecycle and sensitive-data separation, with physical/distributed scope
   distinguished from this application's table design.
5. [PostgreSQL 17: multicolumn indexes][S5]. Leading-column and range behavior.
6. [PostgreSQL 17: partial indexes][S6]. Query predicate implication and partial
   uniqueness.
7. [PostgreSQL 17: index introduction][S7]. Lookup benefits and write maintenance.
8. [PostgreSQL 17: constraints][S8]. Uniqueness, nulls, composite FKs, checks and
   relationship-specific deletion actions.
9. [PostgreSQL 17: EXPLAIN][S9]. Query plans, estimated costs and their limits.
10. [Neon: pg_stat_statements][S10]. Query statistics and reset on compute
    suspension/restart.
11. [PostgreSQL 17: schemas][S11]. Namespaces, organization and privileges.
12. [PostgreSQL 17: table partitioning][S12]. Physical partitions and
    workload-dependent benefits.

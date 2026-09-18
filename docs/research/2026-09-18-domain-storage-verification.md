# Domain storage implementation verification

Status on 2026-09-18: implemented and verified locally. No commit, push, PR,
production migration, or deployment was performed for this implementation.
Native PostgreSQL execution remains a release gate.

## Result

The source schema contains 34 application tables and 463 columns.
`ledger_accounts` now owns account classification, closure, and exact credit
limits. `user_ai_settings` owns AI configuration and encrypted credentials.
`salary_plans`, `rsu_grants`, and `rsu_vestings` store compensation records.
`user_preferences` has 45 columns after removing nine moved fields.

Four new migrations backfill these domains, validate the copied values, then
retire the old classification table and preference columns. They preserve
transaction IDs, original labels, exact financial values, unknown timestamps,
and duplicate vesting occurrences. Ambiguous or invalid data stops migration.
The historical anonymous preference row is skipped only when its moved values
are empty/default; configured orphan records are rejected.

Existing HTTP shapes remain available through the preference coordinator.
Vesting objects additionally expose an optional stable ID. Writes and response
assembly use the owner lock; clean cached domain rows refresh without discarding
pending edits. New registration and full reset create AI defaults. Transaction
reset preserves account, salary, RSU, and AI configuration.

## Validation

| Check | Result |
| --- | --- |
| Backend collection | 1,790 current test cases |
| Backend latest result per case | 1,585 passed, 205 skipped, zero remaining failures |
| Backend unit rerun after integration changes | 940 passed, 74 skipped |
| Final affected integration/migration tests | 103 passed, 33 skipped |
| Reset and recurring lifecycle follow-up | 41 passed, 24 skipped |
| Frontend | 2,063 distinct tests pass after timeout reruns |
| Backend lint and formatting | Pass, 308 files formatted |
| Backend type checking | Pass, 190 source files using backend configuration |
| Frontend type checking | Pass |
| Fresh SQLite migration and ORM parity | Pass |
| Generated schema source hashes | All match the current source files |

The backend full run initially found six outdated-fixture failures. Runtime
fixtures now migrate to the current head, while historical migration fixtures
retain their original target revisions. Transaction-reset expectations now
preserve account identities. All six failing cases passed on follow-up.
The counts above combine the full run with the latest affected-case reruns;
they do not describe one uninterrupted green full-suite run.

Three frontend source-scanning tests exceeded five seconds during the full
parallel run. All three files, containing 12 tests, passed unchanged with two
workers. No timeouts or assertions were relaxed.

Local machine-readable evidence is under
`.cache/domain-storage-verification/`: `backend-results.xml`,
`followup-results.xml`, `unit-results.xml`, and
`final-integration-results.xml`. These disposable reports are not committed.

## Performance evidence and limits

Compensation reads use three queries for multiple owners and 35 grants, with
no query per vesting. Replaying unchanged compensation produces no domain
INSERT, UPDATE, or DELETE statements. Vesting reconciliation uses indexed
lookups and occurrence queues rather than nested scans, retaining identical
events separately. Credit-limit replacement is tested across 320 accounts
with bounded lookups and no per-account SELECT loop.

This establishes bounded query behavior, not a production latency improvement.
The combined preferences response reads multiple domains and holds an owner
lock for consistency. No production p50/p95 timings, storage-size comparison,
Neon query plans, or native PostgreSQL concurrency results were measured.

## Release gate

Windows prevented the isolated PostgreSQL server from starting. Automatic
approval review of the startup action then failed with:
`encrypted summary was created for a different account or model`.
No startup workaround, personal database, or production database was used.

The PostgreSQL CI job now includes domain migrations and exact-decimal tests.
It must pass before release. Migration locks acquire EXCLUSIVE on `users`
before dependent tables, draining existing owner-row locks first; native
verification of this ordering is still required.

Follow the coordinated rollout in [Database Reference](../DATABASE.md):
quiesce old writers, create a recoverable backup/branch, apply the migration,
deploy the matching backend, and verify app behavior before reopening traffic.
The old backend is incompatible with the final schema. Do not auto-merge or
deploy this destructive cutover on the strength of SQLite results alone.

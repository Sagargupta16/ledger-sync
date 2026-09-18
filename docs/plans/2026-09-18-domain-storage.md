# Domain storage implementation

Accepted scope: consolidate account configuration, separate AI settings, and
store salary plans and RSU grants/vestings as relational records. Preserve the
existing HTTP response shapes, transaction IDs, ownership, historical labels,
and financial precision. Import-attempt and monthly budget-history features
remain conditional recommendations, not part of this implementation.

Local implementation is complete. See the
[verification report](../research/2026-09-18-domain-storage-verification.md)
for tests, measured query behavior, and the outstanding PostgreSQL release gate.

## Work ownership

- Accounts: account metadata model/service, account consumers and migration
  `account_settings_2026`.
- AI: dedicated settings model/service, AI consumers and migration
  `ai_settings_2026`.
- Compensation: salary/grant/vesting models/services, compensation consumers
  and migration `compensation_records_2026`.
- Integration: public model exports, preferences API assembly, reset/deletion
  behavior, final legacy-storage removal, migration parity, full verification
  and documentation.

## Migration sequence

`live_index_predicates_2026` -> `account_settings_2026` ->
`ai_settings_2026` -> `compensation_records_2026` ->
`domain_storage_cutover_2026`.

The domain migrations populate new storage first. The final migration verifies
that the copy is equivalent before removing obsolete storage. Invalid or
ambiguous source values must stop the migration without guessing or silently
rounding financial records. Production requires a coordinated migration and
matching backend release.

## Verification

- Existing API and frontend contracts.
- Ownership and exact numeric values.
- Stable compensation identities and duplicate vesting occurrences.
- Transactions-only reset preserves account and personal configuration.
- Full reset/account deletion removes all new owned records.
- Migration backfills, rejection/rollback cases, and ORM parity.
- SQLite and PostgreSQL dialect checks, backend quality checks and relevant
  frontend validation.
- Compare representative query counts and document observed performance only.

## Environment constraint

2026-09-18: an isolated local PostgreSQL cluster was initialized under
`.cache/domain-storage-verification/pgdata`, but Windows prevented starting its
server under the sandbox token. The escalation review also failed with
`encrypted summary was created for a different account or model`. The server
was not started. Do not treat PostgreSQL tests as passed until they actually run
in a working test environment.

/**
 * Analytics V2 -- Data Health (import freshness + data-quality counts).
 */

import { apiClient } from './client'

/**
 * Freshness + data-quality facts about the user's ledger.
 *
 * Every other endpoint answers "what do my numbers say"; this one answers
 * "should I trust them yet". Nulls mean "nothing imported yet" rather than
 * zero, so an empty ledger reads as unknown instead of as clean.
 */
export interface DataHealth {
  /** ISO timestamp of the most recent import, null when none has run. */
  last_import_at: string | null
  /** Whole days since that import, null when none has run. */
  days_stale: number | null
  last_import_file_name: string | null
  /**
   * Row counts from the most recent `import_logs` entry. All null together when
   * no import has ever run on the account.
   *
   * `rows_skipped` does NOT mean rejected: the reconciler returns "skipped" for
   * a row that matched an existing transaction with no field changes, so a
   * re-upload of the same workbook reports nearly every row as skipped (the real
   * local ledger: 8,024 processed, 62 inserted, 7,962 skipped).
   */
  rows_processed: number | null
  rows_inserted: number | null
  rows_updated: number | null
  rows_skipped: number | null
  /**
   * ISO timestamp of the newest rollup recomputation, null when none has run.
   *
   * Distinct from `last_import_at`: importing raw rows and recomputing the
   * pre-aggregated tables are two steps, and the second is allowed to fail
   * without failing the first (the rows are already committed, and a Neon
   * statement timeout must not reject good data).
   */
  rollups_calculated_at: string | null
  /**
   * True when an import landed that the rollups have not absorbed.
   *
   * Every analytics page reads rollups rather than raw transactions, so this
   * being true means the whole workspace is serving the PREVIOUS import's
   * numbers. On the real local ledger it ran 22 days unnoticed: July expenses
   * displayed 74,523.22 against a true 107,651.65.
   */
  rollups_stale: boolean
  transaction_count: number
  /** Oldest transaction date (`YYYY-MM-DD`), null on an empty ledger. */
  earliest_date: string | null
  /** Newest transaction date (`YYYY-MM-DD`), null on an empty ledger. */
  latest_date: string | null
  /** Rows dated after today -- accepted by the importer without a flag. */
  future_dated_count: number
  /** Rows whose note is a placeholder such as the literal "Unknown". */
  placeholder_note_count: number
  /** Rows parked in the catch-all category (e.g. "Miscellaneous"). */
  uncategorized_count: number
}

/**
 * Ledger-quality counts, which the endpoint always returns as numbers (they are
 * `COUNT(*)` results, zero on an empty ledger). The import-log counts are
 * deliberately excluded: they are null together when no import has ever run.
 */
const DATA_HEALTH_COUNT_FIELDS = [
  'transaction_count',
  'future_dated_count',
  'placeholder_note_count',
  'uncategorized_count',
] as const satisfies readonly (keyof DataHealth)[]

/**
 * Narrow an unknown payload to `DataHealth`, throwing when it is not one.
 *
 * This endpoint is the ONE place in the app whose job is to say "do not trust
 * the other screens". A malformed payload rendered as zeroes would read as
 * "your data is perfect", which is the exact lie the page exists to prevent, so
 * a bad shape has to surface as the error state instead. It is reachable in
 * practice: demo mode resolves unknown `/analytics/v2/*` paths through a generic
 * `{ data: [], count: 0 }` catch-all.
 */
function assertDataHealth(payload: unknown): DataHealth {
  if (typeof payload !== 'object' || payload === null) {
    throw new TypeError('data-health returned a non-object payload')
  }
  const row = payload as Record<string, unknown>
  const missing = DATA_HEALTH_COUNT_FIELDS.filter((field) => typeof row[field] !== 'number')
  if (missing.length > 0) {
    throw new TypeError(`data-health payload is missing counts: ${missing.join(', ')}`)
  }
  return payload as DataHealth
}

export const dataHealthApi = {
  // Data Health (import freshness + data-quality counts)
  async getDataHealth(): Promise<DataHealth> {
    const response = await apiClient.get<unknown>('/api/analytics/v2/data-health')
    return assertDataHealth(response.data)
  },
}

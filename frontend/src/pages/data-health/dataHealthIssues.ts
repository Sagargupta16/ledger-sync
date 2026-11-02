/**
 * Quality-issue and last-import derivations for the Data Health page.
 *
 * Split from `dataHealthUtils.ts`, which keeps the freshness and coverage
 * derivations and re-exports these so existing imports keep working.
 */

import type { DataHealth } from '@/services/api/analyticsV2'

import type { ImportLedgerRow, IssueSeverity, QualityIssue } from './types'

/**
 * Severity from the share of the ledger a defect touches. A handful of bad rows
 * in 8,000 is noise; 13% of them is a category system that has stopped working.
 */
function shareSeverity(count: number, share: number, criticalShare: number): IssueSeverity {
  if (count === 0) return 'clean'
  return share >= criticalShare ? 'critical' : 'warning'
}

const PLACEHOLDER_CRITICAL_SHARE = 10
const UNCATEGORIZED_CRITICAL_SHARE = 10

export function buildQualityIssues(health: DataHealth): QualityIssue[] {
  const total = health.transaction_count
  const share = (count: number) => (total > 0 ? (count / total) * 100 : 0)

  const placeholderShare = share(health.placeholder_note_count)
  const uncategorizedShare = share(health.uncategorized_count)

  // The frontend (GitHub Pages) and backend (Vercel) deploy independently, so a
  // newer client can talk to a backend that does not report this field yet.
  // Absent is NOT false: claiming "Up to date" because the server said nothing
  // is the false confidence this whole page exists to remove, so the check is
  // dropped from the list instead of being answered with a guess. The
  // `typeof` guard is deliberate despite the type -- it is the wire we are
  // validating, not our own object.
  const rollupsReported = typeof health.rollups_stale === 'boolean'

  const staleRollupIssues: QualityIssue[] = rollupsReported
    ? [
        // Listed first because it is the only issue here that makes every OTHER
        // number on every other page wrong, rather than describing rows that are
        // merely low quality. Always critical when set: there is no benign amount
        // of "the figures on screen are from a previous import".
        {
          id: 'stale-rollups',
          label: 'Analytics behind import',
          count: health.rollups_stale ? 1 : 0,
          shareOfLedger: 0,
          severity: health.rollups_stale ? 'critical' : 'clean',
          explanation:
            'Your last import succeeded, but the analytics recomputation it triggers did not. Every page reads those pre-computed tables, so the totals, budgets, and net worth you see are from the previous import -- not from the data you just uploaded.',
          guidance:
            'Nothing is re-imported and no transaction changes -- only the summaries are rebuilt.',
          kind: 'flag',
          actionLabel: 'Recompute analytics',
        },
      ]
    : []

  return [
    ...staleRollupIssues,
    {
      id: 'placeholder-notes',
      label: 'Placeholder notes',
      count: health.placeholder_note_count,
      shareOfLedger: placeholderShare,
      severity: shareSeverity(
        health.placeholder_note_count,
        placeholderShare,
        PLACEHOLDER_CRITICAL_SHARE,
      ),
      explanation:
        'Rows whose note is a filler value such as "Unknown". They carry an amount but no description, so merchant and subscription detection cannot see them.',
      guidance: 'Search these rows on Transactions and give each a real note before re-uploading.',
    },
    {
      id: 'uncategorized',
      label: 'Catch-all category',
      count: health.uncategorized_count,
      shareOfLedger: uncategorizedShare,
      severity: shareSeverity(
        health.uncategorized_count,
        uncategorizedShare,
        UNCATEGORIZED_CRITICAL_SHARE,
      ),
      explanation:
        'Spend parked in the generic bucket. Every rupee here is missing from the category it belongs to, so budgets and the spending mix understate the real thing.',
      guidance: 'Add categorization rules in Settings so the next import routes these automatically.',
    },
    {
      id: 'future-dated',
      label: 'Future-dated rows',
      count: health.future_dated_count,
      shareOfLedger: share(health.future_dated_count),
      // Any future-dated row is a data error regardless of how few there are:
      // it inflates a period that has not happened yet.
      severity: health.future_dated_count > 0 ? 'warning' : 'clean',
      explanation:
        'Transactions dated after today. They were accepted without a flag and count toward the current month, so this period looks busier than it is.',
      guidance: 'Correct the dates in your source file, then re-upload with overwrite enabled.',
    },
  ]
}

/**
 * What the last import actually did. The importer reports these counts once in a
 * toast and then forgets them, so a run that added 62 rows out of 8,024 leaves no
 * trace anywhere in the app.
 *
 * Every count is taken straight from `import_logs` rather than derived by
 * subtraction. The backend's `rows_skipped` means "matched an existing row and
 * nothing changed", NOT "rejected", so a re-upload of the same workbook reports
 * almost the whole file as skipped -- calling that "rejected" would invent a
 * catastrophe out of a normal idempotent import.
 *
 * Returns an empty list when no import has run (all counts null), which is the
 * signal to the panel that there is nothing to show.
 */
export function buildImportLedger(health: DataHealth): ImportLedgerRow[] {
  if (health.rows_processed === null) return []
  return [
    {
      id: 'processed',
      label: 'Rows read',
      count: health.rows_processed,
      hint: 'Rows the importer parsed out of the file.',
    },
    {
      id: 'inserted',
      label: 'Rows added',
      count: health.rows_inserted ?? 0,
      hint: 'New transactions written to the ledger.',
    },
    {
      id: 'updated',
      label: 'Rows changed',
      count: health.rows_updated ?? 0,
      hint: 'Existing transactions whose details the file corrected.',
    },
    {
      id: 'skipped',
      label: 'Rows already present',
      count: health.rows_skipped ?? 0,
      hint: 'Rows that matched a stored transaction exactly, so nothing changed.',
    },
  ]
}

/**
 * Pure derivations for the Data Health page.
 *
 * Kept out of the hook so the freshness thresholds and the issue severity
 * ladder are unit-testable without a QueryClient.
 */

import { inclusiveDaySpan, toLocalDateKey } from '@/lib/dateUtils'
import { formatDate } from '@/lib/formatters'
import type { DataHealth } from '@/services/api/analyticsV2'

import type {
  CoverageSummary,
  FreshnessAssessment,
  FreshnessLevel,
  ImportLedgerRow,
  IssueSeverity,
  QualityIssue,
} from './types'

/**
 * Freshness ladder, in days between the newest transaction and today.
 *
 * A finance workspace is only as true as its newest row: rent has already left
 * the account, the salary credit has not landed, so a two-week gap makes the
 * savings rate, every budget, and the net-worth line silently wrong. That is
 * why the top bucket starts at two weeks rather than at a month -- past that
 * point the right message is "stop trusting this screen", not "consider
 * uploading".
 */
const FRESH_MAX_DAYS = 3
const AGING_MAX_DAYS = 7
const STALE_MAX_DAYS = 14

export function freshnessLevel(gapDays: number): FreshnessLevel {
  if (gapDays <= FRESH_MAX_DAYS) return 'fresh'
  if (gapDays <= AGING_MAX_DAYS) return 'aging'
  if (gapDays <= STALE_MAX_DAYS) return 'stale'
  return 'critical'
}

/** Whole days after `latestDate` up to and including today. 0 when caught up. */
export function unimportedDayGap(latestDate: string | null, now: Date = new Date()): number {
  if (!latestDate) return 0
  const todayKey = toLocalDateKey(now)
  if (latestDate >= todayKey) return 0
  // inclusiveDaySpan counts both endpoints; the last data day is not a gap day.
  return inclusiveDaySpan(latestDate, todayKey) - 1
}

/**
 * Newest row date that is NOT in the future, or null when every row is.
 *
 * A future-dated row is not evidence that the ledger is current: the real local
 * ledger on 2026-07-26 held a row dated 2026-07-31 (a scheduled entry the
 * importer accepted without a flag), which made the raw `latest_date` claim the
 * data ran five days past today. Measuring freshness off that would have this
 * page announce "up to date" precisely when the source file is ahead of reality,
 * which is the false confidence the page exists to remove.
 */
function effectiveLatestDate(health: DataHealth, now: Date): string | null {
  if (!health.latest_date) return null
  const todayKey = toLocalDateKey(now)
  if (health.latest_date <= todayKey) return health.latest_date
  // Rows exist, but the newest verifiable one is unknown -- the endpoint only
  // reports the max date. Treat today as the boundary rather than trusting a
  // date that has not happened yet.
  return health.future_dated_count >= health.transaction_count ? null : todayKey
}

/** Whole days since an ISO timestamp, floored at 0. Null input passes through. */
export function daysSince(isoTimestamp: string | null, now: Date = new Date()): number | null {
  if (!isoTimestamp) return null
  const stamp = isoTimestamp.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return null
  return Math.max(0, unimportedDayGap(stamp, now))
}

function pluralDays(n: number): string {
  return n === 1 ? '1 day' : `${n} days`
}

export function assessFreshness(health: DataHealth, now: Date = new Date()): FreshnessAssessment {
  // Freshness is measured against the newest row that has actually happened, so
  // a future-dated row cannot masquerade as up-to-date data.
  const latestDate = effectiveLatestDate(health, now)
  const gapDays = unimportedDayGap(latestDate, now)
  // Prefer the server's own count; fall back to the timestamp when absent.
  const daysSinceImport = health.days_stale ?? daysSince(health.last_import_at, now)

  let headline: string
  if (!latestDate) {
    headline = 'No transactions imported yet.'
  } else if (gapDays === 0) {
    headline = `Data is current through ${formatDate(latestDate)}.`
  } else {
    headline = `Data ends ${formatDate(latestDate)}. ${pluralDays(gapDays)} unimported.`
  }

  let detail: string
  if (!health.last_import_at) {
    detail = 'No import has run on this account.'
  } else {
    const file = health.last_import_file_name ?? 'an unnamed file'
    const when = daysSinceImport === null ? formatDate(health.last_import_at) : null
    const ago = daysSinceImport === 0 ? 'today' : `${pluralDays(daysSinceImport ?? 0)} ago`
    detail = `Last import: ${file}, ${when ?? ago}.`
  }

  return {
    level: freshnessLevel(gapDays),
    gapDays,
    daysSinceImport,
    latestDate,
    headline,
    detail,
  }
}

export function buildCoverage(health: DataHealth, now: Date = new Date()): CoverageSummary | null {
  // Coverage measures how much of the past the ledger accounts for, so it stops
  // at the newest row that has happened -- counting days that have not arrived
  // yet as "covered" would report a complete bar with data missing.
  const latestDate = effectiveLatestDate(health, now)
  if (!health.earliest_date || !latestDate) return null
  const coveredDays = inclusiveDaySpan(health.earliest_date, latestDate)
  const gapDays = unimportedDayGap(latestDate, now)
  return {
    earliestDate: health.earliest_date,
    latestDate,
    coveredDays,
    gapDays,
    totalDays: coveredDays + gapDays,
  }
}

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

/** True when the ledger has never been imported into. */
export function isEmptyLedger(health: DataHealth): boolean {
  return health.transaction_count === 0 && health.last_import_at === null
}

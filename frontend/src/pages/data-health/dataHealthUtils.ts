/**
 * Pure derivations for the Data Health page.
 *
 * Kept out of the hook so the freshness thresholds and the issue severity
 * ladder are unit-testable without a QueryClient.
 */

import { inclusiveDaySpan, getTodayKey } from '@/lib/dateUtils'
import { formatDate } from '@/lib/formatters'
import type { DataHealth } from '@/services/api/analyticsV2'

import type { CoverageSummary, FreshnessAssessment, FreshnessLevel } from './types'

export { buildImportLedger, buildQualityIssues } from './dataHealthIssues'

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
  const todayKey = getTodayKey(now)
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
  const todayKey = getTodayKey(now)
  if (health.latest_date <= todayKey) return health.latest_date
  // The newest row has not happened yet, so the server's newest past-dated row
  // is the freshness date. Today as the boundary would report a stale ledger as
  // current; it stays only for a backend that does not send the field.
  if (health.latest_past_date !== undefined) return health.latest_past_date
  return health.future_dated_count >= health.transaction_count ? null : todayKey
}

/** Whole days since an ISO timestamp, floored at 0. Null input passes through. */
function daysSince(isoTimestamp: string | null, now: Date = new Date()): number | null {
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

/** True when the ledger has never been imported into. */
export function isEmptyLedger(health: DataHealth): boolean {
  return health.transaction_count === 0 && health.last_import_at === null
}

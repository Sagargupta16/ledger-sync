import type { ViewMode } from '@/lib/dateUtils'

/**
 * Generate all period keys for the x-axis based on view mode.
 *
 * - monthly  : day strings "01" .. "28"/"29"/"30"/"31"
 * - yearly   : month strings "01" .. "12"
 * - all_time : sorted keys from groupedData (e.g. "2024-Q1")
 */
export function generateAllPeriods(
  viewMode: ViewMode,
  currentMonth: string,
  groupedData: Record<string, Record<string, number>>
): string[] {
  if (viewMode === 'monthly') {
    const year = Number.parseInt(currentMonth.substring(0, 4))
    const month = Number.parseInt(currentMonth.substring(5, 7))
    const daysInMonth = new Date(year, month, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))
  }

  if (viewMode === 'yearly') {
    return ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
  }

  // all_time — use whatever keys exist in the grouped data, sorted
  return Object.keys(groupedData).sort((a, b) => a.localeCompare(b))
}

/**
 * Format a raw period key into a human-readable display string.
 *
 * - monthly  : period unchanged (day number like "01")
 * - yearly   : short month name (e.g. "Jan", "Feb")
 * - all_time : period unchanged (e.g. "2024-Q1")
 */
export function formatDisplayPeriod(
  period: string,
  viewMode: ViewMode,
  currentYear: number
): string {
  if (viewMode === 'yearly') {
    return new Date(currentYear, Number.parseInt(period) - 1).toLocaleDateString('en-US', {
      month: 'short',
    })
  }
  // monthly and all_time both return the raw period
  return period
}

/**
 * Convert a regular (per-period) data array into a cumulative one.
 * Each category's value becomes the running total up to that period.
 */
export function calculateCumulativeData(
  data: Array<Record<string, number | string>>,
  categories: string[]
): Array<Record<string, number | string>> {
  const cumulativeSums: Record<string, number> = {}
  categories.forEach((category) => {
    cumulativeSums[category] = 0
  })

  return data.map((entry) => {
    const newEntry: Record<string, number | string> = {
      period: entry.period,
      displayPeriod: entry.displayPeriod,
    }
    categories.forEach((category) => {
      cumulativeSums[category] += (entry[category] as number) || 0
      newEntry[category] = cumulativeSums[category]
    })
    return newEntry
  })
}

/** Bucketing granularity for chronological time-series charts. */
export type Granularity = 'day' | 'week' | 'month'

/** Adverb describing how data is bucketed (e.g. "daily", "weekly", "monthly"). */
export function granularityAdverb(granularity: Granularity): string {
  if (granularity === 'day') return 'daily'
  if (granularity === 'week') return 'weekly'
  return 'monthly'
}

/**
 * Pick a sensible granularity based on how much chronological data is in
 * the chart. Daily granularity is too noisy past ~3 months and unreadable
 * past ~1 year, so we step up to weekly/monthly automatically.
 */
export function pickGranularity(spanDays: number): Granularity {
  if (spanDays <= 90) return 'day'
  if (spanDays <= 730) return 'week'
  return 'month'
}

/**
 * Bucket an ISO date (``YYYY-MM-DD``) into the period key for a given
 * granularity. Week granularity uses ISO weeks anchored to Monday so the
 * keys sort lexicographically (``YYYY-Www``).
 */
export function bucketDate(isoDate: string, granularity: Granularity): string {
  if (granularity === 'day') return isoDate.substring(0, 10)
  if (granularity === 'month') return isoDate.substring(0, 7)

  // ISO week. Build a UTC date from the Y/M/D parts and use UTC accessors
  // throughout: new Date('YYYY-MM-DD') parses as UTC midnight, so reading local
  // getDay()/getFullYear() shifted the weekday (and thus the week/year bucket)
  // for negative-offset users near a week boundary.
  const [y, mo, da] = isoDate.slice(0, 10).split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1, da))
  const target = new Date(d.valueOf())
  // ISO week starts on Monday; getUTCDay() returns 0=Sun..6=Sat, shift to Mon=0
  const dayNum = (d.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNum + 3)
  const firstThursday = target.valueOf()
  target.setUTCMonth(0, 1)
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7)
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
  const year = new Date(firstThursday).getUTCFullYear()
  return `${year}-W${String(weekNum).padStart(2, '0')}`
}

/**
 * Render a bucket key into a short, axis-friendly label.
 */
export function formatBucketLabel(periodKey: string, granularity: Granularity): string {
  if (granularity === 'month') {
    const [year, month] = periodKey.split('-')
    return new Date(Number(year), Number(month) - 1).toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
    })
  }
  if (granularity === 'week') {
    // "2024-W12" -> "Wk 12 '24"
    const [year, weekStr] = periodKey.split('-W')
    return `Wk ${weekStr} '${year.slice(2)}`
  }
  // day -> "Mar 15". Build from local Y/M/D parts so the label matches the
  // bucket's calendar day (new Date('YYYY-MM-DD') is UTC midnight and would
  // render the previous day for negative-offset users).
  const [dy, dm, dd] = periodKey.slice(0, 10).split('-').map(Number)
  return new Date(dy, dm - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

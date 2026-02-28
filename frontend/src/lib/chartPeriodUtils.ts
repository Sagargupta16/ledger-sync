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

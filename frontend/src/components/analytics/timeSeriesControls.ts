import { pickGranularity, type Granularity } from '@/lib/chartPeriodUtils'
import { MS_PER_DAY } from '@/lib/dateUtils'

/** Options for the bucket-size select on the spending time-series charts. */
export const GRANULARITY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

/** Options for the cumulative / per-period totals select. */
export const TOTAL_MODE_OPTIONS = [
  { value: 'cumulative', label: 'Cumulative' },
  { value: 'regular', label: 'Regular' },
]

/**
 * Bucket size for a daily series: the user's override, or one picked from the
 * span between the earliest and latest date so long ranges stay legible.
 */
export function resolveGranularity(dates: readonly string[], override: Granularity | 'auto'): Granularity {
  if (override !== 'auto') return override
  const sortedDates = [...dates].sort((a, b) => a.localeCompare(b))
  const spanDays = Math.max(
    1,
    Math.round(
      (new Date(sortedDates.at(-1) ?? '').valueOf() -
        new Date(sortedDates[0]).valueOf()) /
        MS_PER_DAY,
    ),
  )
  return pickGranularity(spanDays)
}

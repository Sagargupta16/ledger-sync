import { MS_PER_DAY, parseLocalDate, toLocalDateKey } from '@/lib/dateUtils'
import {
  normalizeFrequency,
  recurrenceCadence,
  toMonthlyAmount,
  type RecurrenceFrequency,
} from '@/lib/recurrenceFrequency'
import type { RecurringTransaction as ApiRecurringTransaction } from '@/services/api/analyticsV2'

export interface RecurringTransaction {
  pattern: string
  category: string
  subcategory?: string
  avgAmount: number
  frequency: Frequency
  /**
   * `avgAmount` restated as a monthly cost via the shared frequency table.
   * Any "monthly commitment" total must sum THIS, never re-derive it from
   * `frequency` -- re-deriving per consumer is what produced the ~30x-cheap
   * daily row in the first place.
   */
  monthlyAmount: number
  lastDate: string
  occurrences: number
  totalSpent: number
  isActive: boolean
  expectedNextDate: string
}

/**
 * The canonical backend frequency set, not a display subset.
 *
 * This used to be `'monthly' | 'quarterly' | 'yearly'`, with a lookup table
 * that collapsed the backend's other bands into those three. `daily` had no
 * entry and no bucket it could honestly collapse into (it is ~30x a monthly
 * charge), so it fell through to `'monthly'` and every daily cost was
 * understated by 365/12. A 3-value type cannot represent the data, so the
 * fix is the type, not another table row.
 */
export type Frequency = RecurrenceFrequency

/** Adapt backend recurring rows to the component's display shape.
 *
 * The backend ``recurring_transactions`` rollup is the source of truth (built
 * by the analytics engine with confidence scoring), replacing the old
 * client-side ``detectPattern`` over the full ledger. We keep the component's
 * expense focus: income patterns (Salary, Stipend) are dropped so the
 * "monthly commitment" total stays meaningful. */
export function adaptApiRecurring(rows: ApiRecurringTransaction[]): RecurringTransaction[] {
  return rows
    .filter((r) => (r.type ?? '').toLowerCase() !== 'income')
    .map((r) => {
      // No `.toUpperCase()` here: casing is normalized inside the shared
      // helper. Two files pre-normalizing differently (this one upper-cased,
      // the subscription tracker lower-cased) is how the tables drifted.
      const freq = normalizeFrequency(r.frequency) ?? 'monthly'
      const amount = Math.abs(r.expected_amount)
      return {
        pattern: r.name,
        category: r.category,
        subcategory: r.subcategory ?? undefined,
        avgAmount: amount,
        frequency: freq,
        monthlyAmount: toMonthlyAmount(amount, freq),
        lastDate: r.last_occurrence ?? '',
        occurrences: r.occurrences,
        totalSpent: amount * r.occurrences,
        isActive: r.is_active,
        expectedNextDate: r.next_expected ?? '',
      }
    })
    .sort((a, b) => b.avgAmount - a.avgAmount)
}

/** Sum the monthly-equivalent cost of a set of adapted recurring rows. */
export function sumMonthlyCommitment(rows: RecurringTransaction[]): number {
  return rows.reduce((sum, r) => sum + r.monthlyAmount, 0)
}

export function computeIntervals(sortedDates: string[]): number[] {
  const intervals: number[] = []
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1])
    const curr = new Date(sortedDates[i])
    const daysDiff = Math.round((curr.getTime() - prev.getTime()) / MS_PER_DAY)
    intervals.push(daysDiff)
  }
  return intervals
}

/**
 * Interval bands mirroring the backend detector's `_FREQ_BANDS`
 * (`core/analytics/recurring.py`), plus the `daily` band the backend covers via
 * its lowest band start. Each entry is `[minDays, frequency]`; a band runs up to
 * the next band's start, and `MAX_DETECTABLE_INTERVAL_DAYS` caps the last one
 * (the backend's `_FREQ_MAX_DAYS`).
 *
 * The three hardcoded windows this replaced left gaps between them, so a stream
 * at a 50-day cadence classified as nothing and was dropped entirely.
 */
const INTERVAL_BANDS: ReadonlyArray<readonly [number, Frequency]> = [
  [1, 'daily'],
  [4, 'weekly'],
  [11, 'biweekly'],
  [20, 'monthly'],
  [50, 'bimonthly'],
  [80, 'quarterly'],
  [130, 'semiannual'],
  [270, 'yearly'],
]

const MAX_DETECTABLE_INTERVAL_DAYS = 400

export function classifyFrequency(avgInterval: number): Frequency | null {
  if (avgInterval < INTERVAL_BANDS[0][0] || avgInterval >= MAX_DETECTABLE_INTERVAL_DAYS) return null
  for (let i = INTERVAL_BANDS.length - 1; i >= 0; i--) {
    if (avgInterval >= INTERVAL_BANDS[i][0]) return INTERVAL_BANDS[i][1]
  }
  return null
}

export function isConsistentTiming(intervals: number[], avgInterval: number, occurrenceCount: number): boolean {
  if (intervals.length <= 1) return true
  const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length
  const stdDev = Math.sqrt(variance)
  const coefficientOfVariation = avgInterval > 0 ? stdDev / avgInterval : 0
  const maxCV = occurrenceCount <= 3 ? 0.6 : 0.4
  return coefficientOfVariation <= maxCV
}

export function isConsistentAmount(amounts: number[]): boolean {
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
  const consistentAmounts = amounts.filter((a) => avgAmount > 0 && Math.abs(a - avgAmount) / avgAmount < 0.3)
  return consistentAmounts.length >= amounts.length * 0.5
}

/**
 * Step one period forward from `lastDate`.
 *
 * Driven by the shared cadence table. The `if monthly / else if quarterly /
 * else +1 year` chain this replaced sent every other frequency -- daily
 * included -- a full year into the future.
 */
export function computeExpectedNextDate(lastDate: Date, frequency: Frequency): Date {
  const expectedNext = new Date(lastDate)
  const cadence = recurrenceCadence(frequency)
  if (!cadence) return expectedNext
  if (cadence.unit === 'day') {
    expectedNext.setDate(expectedNext.getDate() + cadence.stride)
  } else {
    expectedNext.setMonth(expectedNext.getMonth() + cadence.stride)
  }
  return expectedNext
}

/**
 * Grace period, in days, before a pattern is called dormant.
 *
 * `Record<Frequency, number>` on purpose: adding a frequency to the shared enum
 * will not compile until it has a threshold here. The monthly / quarterly /
 * yearly values are the pre-existing ones, unchanged; the rest fill the holes
 * that the old 3-key map left, where `maxDaysMap[frequency]` was `undefined`
 * and `daysSinceLast < undefined` is always false -- every non-bucketed
 * pattern read as inactive.
 */
const STALENESS_WINDOW_DAYS: Readonly<Record<Frequency, number>> = {
  daily: 7,
  weekly: 21,
  biweekly: 35,
  monthly: 45,
  bimonthly: 90,
  quarterly: 120,
  semiannual: 240,
  yearly: 400,
}

export function stalenessWindowDays(frequency: Frequency): number {
  return STALENESS_WINDOW_DAYS[frequency]
}

export function checkIsActive(lastDate: Date, frequency: Frequency, now: Date = new Date()): boolean {
  const daysSinceLast = Math.round((now.getTime() - lastDate.getTime()) / MS_PER_DAY)
  return daysSinceLast < stalenessWindowDays(frequency)
}

export function detectPattern(
  data: {
    amounts: number[]
    dates: string[]
    category: string
    subcategory?: string
    note?: string
  },
): RecurringTransaction | null {
  if (data.amounts.length < 2) return null // Need at least 2 occurrences for recurring

  // Sort dates
  const sortedDates = [...data.dates].sort((a, b) => a.localeCompare(b))

  // Calculate intervals between transactions
  const intervals = computeIntervals(sortedDates)
  if (intervals.length < 1) return null

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const frequency = classifyFrequency(avgInterval)
  if (!frequency) return null

  if (!isConsistentTiming(intervals, avgInterval, data.amounts.length)) return null
  if (!isConsistentAmount(data.amounts)) return null

  const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length
  const lastDateStr = sortedDates.at(-1)
  if (!lastDateStr) return null
  const lastDate = parseLocalDate(lastDateStr)
  const expectedNext = computeExpectedNextDate(lastDate, frequency)
  const isActive = checkIsActive(lastDate, frequency)
  const subcategorySuffix = data.subcategory ? ` - ${data.subcategory}` : ''
  const patternName = data.note || `${data.category}${subcategorySuffix}`

  return {
    pattern: patternName,
    category: data.category,
    subcategory: data.subcategory,
    avgAmount,
    frequency,
    monthlyAmount: toMonthlyAmount(avgAmount, frequency),
    lastDate: lastDateStr,
    occurrences: data.amounts.length,
    totalSpent: data.amounts.reduce((a, b) => a + b, 0),
    isActive,
    expectedNextDate: toLocalDateKey(expectedNext),
  }
}

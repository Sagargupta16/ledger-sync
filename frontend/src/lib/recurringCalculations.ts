import { getDateKey, MONTHS_PER_YEAR, MS_PER_DAY, parseLocalDate, toLocalDateKey } from '@/lib/dateUtils'
import { DAYS_PER_YEAR, recurrenceCadence, toMonthlyAmount } from '@/lib/recurrenceFrequency'
import { medianOf } from '@/lib/distribution'
import { currentMonthKey, shareOfIncomePercent } from '@/lib/savingsRate'
import type { RecurringTransaction } from '@/services/api/analyticsV2'

export type RecurringFreshness = 'confirmed' | 'recent' | 'needs-review' | 'unassessed' | 'paused'

export type RecurringFreshnessInput = Pick<
  RecurringTransaction,
  'frequency' | 'last_occurrence' | 'is_active' | 'is_confirmed'
>

export type RecurringCalculationInput = RecurringFreshnessInput & Pick<
  RecurringTransaction,
  'expected_amount' | 'type' | 'pattern_kind'
>

export interface RecurringMonthlySubtotal {
  monthlyExpense: number
  monthlyIncome: number
  count: number
}

export interface RecurringCommitmentSummary extends RecurringMonthlySubtotal {
  netMonthly: number
  /** Confirmed commitments, plus detections still within their review window. */
  current: RecurringMonthlySubtotal
  /** Old unconfirmed detections; still included in the full totals. */
  needsReview: RecurringMonthlySubtotal
  /** Detections whose date or cadence does not support a freshness assessment. */
  unassessed: RecurringMonthlySubtotal
  pausedMonthlyExpense: number
  pausedExpenseCount: number
}

/** Calendar-day arithmetic avoids daylight-saving and time-of-day boundary drift. */
function calendarDay(dateString: string): number {
  const key = getDateKey(dateString)
  const date = parseLocalDate(key)
  if (toLocalDateKey(date) !== key) return Number.NaN
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY
}

/**
 * Review after more than two conservative intervals plus seven days.
 * Calendar cadences allow 31 days per month and 366 per year; money conversion
 * continues to use the existing annualization table without changing totals.
 */
function reviewWindowDays(frequency: string | null): number | null {
  const cadence = recurrenceCadence(frequency)
  if (!cadence) return null
  let interval = cadence.stride
  if (cadence.unit === 'month') {
    interval = cadence.stride === MONTHS_PER_YEAR ? DAYS_PER_YEAR + 1 : cadence.stride * 31
  }
  return interval * 2 + 7
}

/** Pure assessment only: never changes a record's active or confirmed state. */
export function getRecurringFreshness(
  item: RecurringFreshnessInput,
  asOfDateKey: string,
): RecurringFreshness {
  if (!item.is_active) return 'paused'
  if (item.is_confirmed) return 'confirmed'
  const reviewWindow = reviewWindowDays(item.frequency)
  if (reviewWindow === null || !item.last_occurrence) return 'unassessed'
  const age = calendarDay(asOfDateKey) - calendarDay(item.last_occurrence)
  if (!Number.isFinite(age) || age < 0) return 'unassessed'
  return age > reviewWindow ? 'needs-review' : 'recent'
}

function emptySubtotal(): RecurringMonthlySubtotal {
  return { monthlyExpense: 0, monthlyIncome: 0, count: 0 }
}

function addMonthlyAmount(
  subtotal: RecurringMonthlySubtotal,
  type: RecurringCalculationInput['type'],
  amount: number,
): void {
  subtotal.count += 1
  if (type === 'Expense') subtotal.monthlyExpense += amount
  if (type === 'Income') subtotal.monthlyIncome += amount
}

/**
 * All active commitments stay in the headline totals, including old or
 * unassessed detections. Habits stay outside fixed costs; paused expenses are
 * reported separately without assuming the obligation was cancelled.
 */
export function summarizeRecurringCommitments(
  items: readonly RecurringCalculationInput[],
  asOfDateKey: string,
): RecurringCommitmentSummary {
  const summary: RecurringCommitmentSummary = {
    ...emptySubtotal(),
    netMonthly: 0,
    current: emptySubtotal(),
    needsReview: emptySubtotal(),
    unassessed: emptySubtotal(),
    pausedMonthlyExpense: 0,
    pausedExpenseCount: 0,
  }
  for (const item of items) {
    if (item.pattern_kind === 'habit') continue
    const monthly = toMonthlyAmount(item.expected_amount, item.frequency)
    if (!item.is_active) {
      if (item.type === 'Expense') {
        summary.pausedMonthlyExpense += monthly
        summary.pausedExpenseCount += 1
      }
      continue
    }
    const freshness = getRecurringFreshness(item, asOfDateKey)
    let subtotal = summary.current
    if (freshness === 'needs-review') subtotal = summary.needsReview
    if (freshness === 'unassessed') subtotal = summary.unassessed
    addMonthlyAmount(subtotal, item.type, monthly)
    addMonthlyAmount(summary, item.type, monthly)
  }
  summary.netMonthly = summary.monthlyIncome - summary.monthlyExpense
  return summary
}

export const RECENT_INCOME_MONTHS = 12

export interface MonthlyIncomeRow {
  readonly period: string
  readonly income: { readonly total: number }
}

/** Recent positive, complete-month income is the baseline for current commitments. */
export function typicalMonthlyIncome(
  summaries: readonly MonthlyIncomeRow[] | undefined,
  now: Date = new Date(),
): number | null {
  if (!summaries?.length) return null
  const usable = summaries.filter((row) => row.period < currentMonthKey(now) && row.income.total > 0)
  if (usable.length === 0) return null
  const window = new Set(
    usable.map((row) => row.period).sort((a, b) => a.localeCompare(b)).slice(-RECENT_INCOME_MONTHS),
  )
  return medianOf(usable.filter((row) => window.has(row.period)).map((row) => row.income.total))
}

export function recurringCoveragePercent(
  fixedCommitmentsMonthly: number,
  typicalIncome: number | null,
): number | null {
  return typicalIncome != null && typicalIncome > 0
    ? shareOfIncomePercent(fixedCommitmentsMonthly, typicalIncome)
    : null
}

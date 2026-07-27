import { computeMedian } from './quickInsightsData'

/**
 * How many recent complete months define "a typical month's income". Twelve
 * covers one full annual cycle, so bonus/appraisal months neither dominate nor
 * are excluded, and it is short enough that a raise moves the figure.
 */
export const RECENT_INCOME_MONTHS = 12

/** One row of `/api/analytics/v2/monthly-summaries`, narrowed to what we read. */
export interface MonthlyIncomeRow {
  readonly period: string
  readonly income: { readonly total: number }
}

/**
 * Typical monthly income from the RECENT past, for ratios whose numerator is a
 * present-day monthly obligation (Recurring Coverage).
 *
 * An all-time mean (`totalIncome / monthsInRange`) is the wrong denominator for
 * those: measured on the real ledger it is 68,130.93/month across the 2,769-day
 * span, while the median of the last 12 complete months is 216,756.94 -- a 3.2x
 * gap, because income grew from ~17k/month in 2019 to ~220k now. The 115,027.89
 * of active fixed commitments therefore published as 168.8% coverage, labelled
 * "High fixed cost load", when the honest figure is 53.1%.
 *
 * The month in progress is excluded for the same reason `medianSpendingMonth`
 * excludes it -- a partial month reads low and would inflate the ratio. Months
 * with zero income are dropped because they cannot serve as a divisor (the real
 * ledger has one: 2019-02). Returns `null` when no complete month with income
 * exists, so the caller decides rather than dividing by nothing.
 */
export function typicalMonthlyIncome(
  summaries: readonly MonthlyIncomeRow[] | undefined,
  now: Date = new Date(),
): number | null {
  if (!summaries?.length) return null
  const cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const usable = summaries.filter((s) => s.period < cutoff && s.income.total > 0)
  if (usable.length === 0) return null
  // The endpoint returns newest-first; sort so `slice` takes the newest window
  // regardless of the order the caller received.
  const window = new Set(
    usable
      .map((s) => s.period)
      .sort()
      .slice(-RECENT_INCOME_MONTHS),
  )
  return computeMedian(usable.filter((s) => window.has(s.period)).map((s) => s.income.total))
}

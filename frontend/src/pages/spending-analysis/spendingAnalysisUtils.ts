/** Presentation adapters for the shared spending calculations. */
import { SPENDING_TYPE_COLORS } from '@/lib/preferencesUtils'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { meanRateSubtitle } from '@/lib/distribution'
import type { MonthlySpendShape, SpendingBreakdown } from '@/lib/finance/spending'

export { monthKeysBetween } from '@/lib/dateUtils'
export { computeBudgetRuleMetrics, monthlySpendShape, spanMonthKeys } from '@/lib/finance/spending'
export type { BudgetRuleMetrics, MonthlySpendShape } from '@/lib/finance/spending'

/** Color for Savings (semantic, distinct from income green). */
export const SAVINGS_COLOR = SEMANTIC_COLORS.savings

/**
 * Build chart data for the 50/30/20 spending breakdown.
 *
 * The slice colour is carried on the datum as `fill` (not `color`) because
 * Recharts' `Pie` merges each data row over its sector props and reads `fill`
 * from there. That is the replacement for the deprecated `<Cell>` child, and
 * the same value still drives the hand-rolled HTML legend.
 */
export function buildSpendingChartData(
  spendingBreakdown: SpendingBreakdown,
  totalIncome: number,
  savings: number,
) {
  if (!spendingBreakdown || totalIncome <= 0) return []
  return [
    { name: 'Needs', value: spendingBreakdown.essential, fill: SPENDING_TYPE_COLORS.essential },
    { name: 'Wants', value: spendingBreakdown.discretionary, fill: SPENDING_TYPE_COLORS.discretionary },
    { name: 'Savings', value: savings, fill: SAVINGS_COLOR },
  ].filter((d) => d.value > 0)
}

/**
 * Subtitle for the "Monthly Avg" card. States the divisor the mean was taken
 * over, and appends the typical month whenever the mean runs far enough above it
 * to misinform -- the headline stays a mean, so the label must not let it be read
 * as a typical month. On the real ledger's all-time complete months the mean is
 * 43,190.00 against a median month of 12,101.31 (3.6x), so this fires; the old
 * copy was the flat string "Average spending per month".
 */
export function monthlyAvgSubtitleFor(
  shape: MonthlySpendShape | null,
  formatMoney: (n: number) => string,
): string {
  if (!shape) return 'Average spending per month'
  const monthNoun = shape.monthsCounted === 1 ? 'month' : 'months'
  const sparse =
    shape.monthsWithSpend < shape.monthsCounted
      ? ` (${shape.monthsWithSpend} with spend)`
      : ''
  return meanRateSubtitle(shape.mean, shape.median, formatMoney, {
    meanClause: `Mean over ${shape.monthsCounted} ${monthNoun}${sparse}`,
    typicalNoun: 'month is',
  })
}

/**
 * On-chart label for the "Avg" reference line drawn at the same mean the
 * "Monthly Avg" card headlines.
 *
 * The bare string "Avg: <amount>" was the label while the divisor underneath it
 * changed to every calendar month in the window. Since the trend series shares
 * that spine ({@link spanMonthKeys}), the line IS the mean of the plotted bars --
 * but "average of what" is still invisible on a chart where several bars can be
 * zero, so the month count travels with the number. Kept terse because it is
 * drawn at 10px inside the plot area; the card subtitle carries the full
 * disclosure.
 */
export function monthlyAvgLineLabelFor(
  shape: MonthlySpendShape | null,
  formatMoney: (n: number) => string,
  mean: number,
): string {
  if (!shape) return `Avg: ${formatMoney(mean)}`
  return `Avg/mo over ${shape.monthsCounted}: ${formatMoney(shape.mean)}`
}

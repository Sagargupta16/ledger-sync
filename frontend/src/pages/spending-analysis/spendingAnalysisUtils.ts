/**
 * Pure helpers for Spending Analysis -- 50/30/20 budget-rule chart data and
 * metric computation. No React; deterministic and unit-testable.
 */

import { SPENDING_TYPE_COLORS } from '@/lib/preferencesUtils'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { meanRateSubtitle, medianOf } from '@/lib/distribution'
import { currentMonthKey } from '@/lib/savingsRate'

/** Color for Savings (semantic, distinct from income green). */
export const SAVINGS_COLOR = SEMANTIC_COLORS.savings

/** Central tendency of per-month spend, plus the divisor it was taken over. */
export interface MonthlySpendShape {
  /** Total spend divided by every calendar month in the window. */
  readonly mean: number
  /** Middle month of the same window, zero-spend months included. */
  readonly median: number
  /** Calendar months in the divisor. */
  readonly monthsCounted: number
  /** How many of those months carried any spend. */
  readonly monthsWithSpend: number
}

/** Every "YYYY-MM" from `first` to `last` inclusive, gaps included. */
export function monthKeysBetween(first: string, last: string): string[] {
  const keys: string[] = []
  let year = Number(first.slice(0, 4))
  let month = Number(first.slice(5, 7))
  for (let guard = 0; guard < 1200; guard++) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    if (key > last) break
    keys.push(key)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return keys
}

/**
 * The CALENDAR months a window covers, given the months that carry rows.
 *
 * One source of truth for "which months is this page talking about", because two
 * consumers have to agree exactly: the "Monthly Avg" KPI (and the Avg reference
 * line drawn from it) and the Expense Trend bars. When the KPI divided by the
 * selected window while the chart plotted only row-bearing months, the reference
 * line could sit below EVERY bar while labelled as their average -- reproduced
 * this session on a yearly-2025 window whose rows start in June: 7 bars of
 * 70,000.00 with an Avg line at 40,833.33 and `everyBarAboveAvgLine: true`.
 * Sharing the spine makes the line the mean of the bars by construction.
 *
 * The window comes from the range when it is bounded (a chosen FY is 12 months
 * whether or not you spent in all of them) and from the rows themselves when it
 * is not (all-time has no start date, so its end is whatever the last row says).
 * On that open-ended path the end is capped at the CURRENT month via
 * `currentMonthKey`, because a future-dated row would otherwise append empty
 * months -- this ledger holds a 2026-07-31 row and one dated a year out would add
 * twelve zero months. The cap stops at the current month rather than the last
 * complete one: excluding the in-progress month is the caller's job (it passes a
 * complete-months range), and this is also reached on that range's documented
 * empty fallback, where the month in progress is the only data there is.
 *
 * Returns the row months unchanged when the window spans none of them (an
 * all-future or inverted range), so the page shows their real total rather than a
 * zero.
 */
export function spanMonthKeys(
  rowMonths: readonly string[],
  range: { start_date?: string | null; end_date?: string | null },
  now: Date = new Date(),
): string[] {
  if (rowMonths.length === 0) return []
  const cutoff = currentMonthKey(now)
  const rowLast = rowMonths[rowMonths.length - 1]
  const first = range.start_date?.slice(0, 7) ?? rowMonths[0]
  const last = range.end_date?.slice(0, 7) ?? (rowLast > cutoff ? cutoff : rowLast)
  const spanned = monthKeysBetween(first, last)
  return spanned.length > 0 ? spanned : [...rowMonths]
}

/**
 * Mean and median spend per CALENDAR month over a window.
 *
 * The divisor is every month in the window, not just the months that happen to
 * carry a row. "Monthly Avg" claims a per-month figure, and a month you spent
 * nothing in is still a month; dividing by months-with-activity silently answers
 * a different question ("average per month in which I spent"). Measured on the
 * real ledger on 2026-07-27 over its complete months: 3,887,099.76 across 89
 * months-with-expense = 43,675.28, against 90 calendar months (2019-03 has no
 * expense row) = 43,190.00. Small at whole-ledger scale, but this page is
 * category deep-linkable and the gap scales with sparsity -- `?category=Family`
 * spans 87 months and carries rows in 48, so the same KPI read 27,002.56 instead
 * of 14,897.96, an 81.3% overstatement of that category's monthly cost.
 *
 * The window itself comes from {@link spanMonthKeys}, which the Expense Trend
 * series shares, so the "Avg" reference line drawn from this mean is the mean of
 * the bars actually plotted.
 *
 * The MEAN stays the headline. Budget and runway math needs the total spread
 * over the period -- you spend the total, not the median -- so the median is
 * returned alongside for disclosure rather than as a replacement.
 *
 * The median keeps ZERO months in, matching the mean's divisor: both answer "what
 * does a month cost", and dropping the empty months from one but not the other
 * ships two different definitions of month under one subtitle. See
 * `medianSpendingMonth` in `components/shared/quickInsightsData.ts`, which had
 * drifted the other way.
 */
export function monthlySpendShape(
  expenses: readonly { date: string; amount: number }[],
  range: { start_date?: string | null; end_date?: string | null },
  now: Date = new Date(),
): MonthlySpendShape | null {
  const byMonth = new Map<string, number>()
  for (const tx of expenses) {
    const key = tx.date.slice(0, 7)
    byMonth.set(key, (byMonth.get(key) ?? 0) + Math.abs(tx.amount))
  }
  if (byMonth.size === 0) return null

  const rowMonths = [...byMonth.keys()].sort((a, b) => a.localeCompare(b))
  const months = spanMonthKeys(rowMonths, range, now)
  const values = months.map((key) => byMonth.get(key) ?? 0)
  const total = values.reduce((sum, value) => sum + value, 0)

  return {
    mean: total / months.length,
    median: medianOf(values),
    monthsCounted: months.length,
    monthsWithSpend: values.filter((value) => value > 0).length,
  }
}

type SpendingBreakdown = { essential: number; discretionary: number } | null

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

export interface BudgetRuleMetrics {
  essentialPercent: number
  discretionaryPercent: number
  savingsPercent: number
  essentialTarget: number
  discretionaryTarget: number
  savingsTarget: number
  isOverspendingEssential: boolean
  isOverspendingDiscretionary: boolean
  isUnderSaving: boolean
}

/**
 * Calculate the budget-rule metrics (50/30/20) based on income breakdown.
 * The +/-5 percentage-point bands match the page's "on track" tolerance.
 */
export function computeBudgetRuleMetrics(
  spendingBreakdown: SpendingBreakdown,
  totalIncome: number,
  savings: number,
  needsTarget: number,
  wantsTarget: number,
  savingsTargetPct: number,
): BudgetRuleMetrics | null {
  if (!spendingBreakdown || totalIncome <= 0) return null

  const essentialPercent = (spendingBreakdown.essential / totalIncome) * 100
  const discretionaryPercent = (spendingBreakdown.discretionary / totalIncome) * 100
  const savingsPercent = (savings / totalIncome) * 100

  return {
    essentialPercent,
    discretionaryPercent,
    savingsPercent,
    essentialTarget: needsTarget,
    discretionaryTarget: wantsTarget,
    savingsTarget: savingsTargetPct,
    isOverspendingEssential: essentialPercent > needsTarget + 5,
    isOverspendingDiscretionary: discretionaryPercent > wantsTarget + 5,
    isUnderSaving: savingsPercent < savingsTargetPct - 5,
  }
}

import { monthKeysBetween } from '@/lib/dateUtils'
import { medianOf } from '@/lib/distribution'
import { currentMonthKey, shareOfIncomePercent } from '@/lib/savingsRate'

export interface MonthlySpendShape {
  readonly mean: number
  readonly median: number
  readonly monthsCounted: number
  readonly monthsWithSpend: number
}

interface SpendingRange {
  start_date?: string | null
  end_date?: string | null
}

export type SpendingBreakdown = { essential: number; discretionary: number } | null

/** Calendar months shared by spending averages and trend bars, including gaps. */
export function spanMonthKeys(
  rowMonths: readonly string[],
  range: SpendingRange,
  now: Date = new Date(),
): string[] {
  if (rowMonths.length === 0) return []
  const cutoff = currentMonthKey(now)
  const rowLast = rowMonths.at(-1)!
  const first = range.start_date?.slice(0, 7) ?? rowMonths[0]
  const last = range.end_date?.slice(0, 7) ?? (rowLast > cutoff ? cutoff : rowLast)
  const spanned = monthKeysBetween(first, last)
  // Preserve the caller's observed span when its supplied bounds do not overlap.
  return spanned.length > 0 ? spanned : [...rowMonths]
}

/** Mean and median use the same calendar divisor, including zero-spend months. */
export function monthlySpendShape(
  expenses: readonly { date: string; amount: number }[],
  range: SpendingRange,
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

/** The spending rule measures available consumption surplus, floored at zero. */
export function spendingRuleSavings(income: number, comparableSpending: number): number {
  return Math.max(0, income - comparableSpending)
}

/** Budget shares retain the configured targets and five percentage-point tolerance. */
export function computeBudgetRuleMetrics(
  spendingBreakdown: SpendingBreakdown,
  totalIncome: number,
  savings: number,
  needsTarget: number,
  wantsTarget: number,
  savingsTargetPct: number,
): BudgetRuleMetrics | null {
  if (!spendingBreakdown || totalIncome <= 0) return null
  const essentialPercent = shareOfIncomePercent(spendingBreakdown.essential, totalIncome)
  const discretionaryPercent = shareOfIncomePercent(spendingBreakdown.discretionary, totalIncome)
  const savingsPercent = shareOfIncomePercent(savings, totalIncome)

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

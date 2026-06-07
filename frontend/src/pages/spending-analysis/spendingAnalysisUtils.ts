/**
 * Pure helpers for Spending Analysis -- 50/30/20 budget-rule chart data and
 * metric computation. No React; deterministic and unit-testable.
 */

import { SPENDING_TYPE_COLORS } from '@/lib/preferencesUtils'
import { SEMANTIC_COLORS } from '@/constants/chartColors'

/** Color for Savings (semantic, distinct from income green). */
export const SAVINGS_COLOR = SEMANTIC_COLORS.savings

type SpendingBreakdown = { essential: number; discretionary: number } | null

/** Build chart data for the 50/30/20 spending breakdown. */
export function buildSpendingChartData(
  spendingBreakdown: SpendingBreakdown,
  totalIncome: number,
  savings: number,
) {
  if (!spendingBreakdown || totalIncome <= 0) return []
  return [
    { name: 'Needs', value: spendingBreakdown.essential, color: SPENDING_TYPE_COLORS.essential },
    { name: 'Wants', value: spendingBreakdown.discretionary, color: SPENDING_TYPE_COLORS.discretionary },
    { name: 'Savings', value: savings, color: SAVINGS_COLOR },
  ].filter((d) => d.value > 0)
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

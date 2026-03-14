import { formatCurrency, formatPercent } from '@/lib/formatters'
import type { PeriodSummary, CategoryDelta } from './types'
import { pctChange } from './utils'

function generateIncomeInsight(periodA: PeriodSummary, periodB: PeriodSummary): string | null {
  const incChange = pctChange(periodB.income, periodA.income)
  if (Math.abs(incChange) < 5) return null
  return incChange > 0
    ? `Income grew by ${formatPercent(Math.abs(incChange))} from ${periodA.label} to ${periodB.label}.`
    : `Income dropped by ${formatPercent(Math.abs(incChange))} from ${periodA.label} to ${periodB.label}.`
}

function generateExpenseInsight(periodA: PeriodSummary, periodB: PeriodSummary): string | null {
  const expChange = pctChange(periodB.expense, periodA.expense)
  if (Math.abs(expChange) < 5) return null
  return expChange > 0
    ? `Spending increased by ${formatPercent(Math.abs(expChange))}. Review discretionary categories.`
    : `Spending decreased by ${formatPercent(Math.abs(expChange))} — good cost control.`
}

function generateSavingsRateInsight(periodA: PeriodSummary, periodB: PeriodSummary): string | null {
  const rateShift = periodB.savingsRate - periodA.savingsRate
  if (Math.abs(rateShift) < 3) return null
  return rateShift > 0
    ? `Savings rate improved by ${rateShift.toFixed(1)} percentage points.`
    : `Savings rate declined by ${Math.abs(rateShift).toFixed(1)} percentage points.`
}

function generateCategorySwingInsight(expenseDeltas: CategoryDelta[]): string | null {
  if (expenseDeltas.length === 0) return null
  const biggest = expenseDeltas[0]
  if (Math.abs(biggest.changeAbs) === 0) return null
  const direction = biggest.changeAbs > 0 ? 'increased' : 'decreased'
  return `"${biggest.category}" ${direction} the most: ${formatCurrency(Math.abs(biggest.changeAbs))} (${biggest.change > 0 ? '+' : ''}${biggest.change.toFixed(1)}%).`
}

function generateNewCategoriesInsight(periodA: PeriodSummary, periodB: PeriodSummary): string | null {
  const newCats = Object.keys(periodB.categories).filter(
    (c) => !periodA.categories[c] && (periodB.categories[c].expense > 0 || periodB.categories[c].income > 0)
  )
  if (newCats.length === 0) return null
  return `${newCats.length} new categor${newCats.length === 1 ? 'y' : 'ies'} appeared in ${periodB.label}: ${newCats.slice(0, 3).join(', ')}${newCats.length > 3 ? '...' : ''}.`
}

function generateGoneCategoriesInsight(periodA: PeriodSummary, periodB: PeriodSummary): string | null {
  const goneCats = Object.keys(periodA.categories).filter(
    (c) => !periodB.categories[c] && (periodA.categories[c].expense > 0 || periodA.categories[c].income > 0)
  )
  if (goneCats.length === 0) return null
  return `${goneCats.length} categor${goneCats.length === 1 ? 'y' : 'ies'} no longer active in ${periodB.label}: ${goneCats.slice(0, 3).join(', ')}${goneCats.length > 3 ? '...' : ''}.`
}

function generateTxVolumeInsight(periodA: PeriodSummary, periodB: PeriodSummary): string | null {
  const txChange = pctChange(periodB.transactions, periodA.transactions)
  if (Math.abs(txChange) < 15) return null
  return txChange > 0
    ? `Transaction volume surged ${formatPercent(Math.abs(txChange))} — more frequent activity.`
    : `Transaction count fell ${formatPercent(Math.abs(txChange))} — fewer transactions recorded.`
}

export function generateAllInsights(
  periodA: PeriodSummary,
  periodB: PeriodSummary,
  expenseDeltas: CategoryDelta[],
): string[] {
  const generators = [
    () => generateIncomeInsight(periodA, periodB),
    () => generateExpenseInsight(periodA, periodB),
    () => generateSavingsRateInsight(periodA, periodB),
    () => generateCategorySwingInsight(expenseDeltas),
    () => generateNewCategoriesInsight(periodA, periodB),
    () => generateGoneCategoriesInsight(periodA, periodB),
    () => generateTxVolumeInsight(periodA, periodB),
  ]
  return generators.map((gen) => gen()).filter((s): s is string => s !== null)
}

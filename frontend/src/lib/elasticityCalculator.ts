/**
 * Expense Elasticity Analysis
 *
 * Per-category linear regression of monthly spending against monthly income.
 * Elasticity = (slope * mean_income) / mean_spending
 *   > 1 = elastic (luxury -- spending grows faster than income)
 *   < 1 = inelastic (necessity -- spending is stable regardless of income)
 */

export interface ElasticityResult {
  category: string
  elasticity: number
  rSquared: number
  classification: 'elastic' | 'inelastic' | 'unit-elastic'
  avgMonthly: number
}

function linearRegression(x: number[], y: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = x.length
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 }

  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((a, xi, i) => a + xi * y[i], 0)
  const sumX2 = x.reduce((a, xi) => a + xi * xi, 0)

  const meanX = sumX / n
  const meanY = sumY / n

  const denom = sumX2 - (sumX * sumX) / n
  if (denom === 0) return { slope: 0, intercept: meanY, rSquared: 0 }

  const slope = (sumXY - (sumX * sumY) / n) / denom
  const intercept = meanY - slope * meanX

  // R-squared
  const ssRes = y.reduce((sum, yi, i) => {
    const predicted = slope * x[i] + intercept
    return sum + (yi - predicted) ** 2
  }, 0)
  const ssTot = y.reduce((sum, yi) => sum + (yi - meanY) ** 2, 0)
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0

  return { slope, intercept, rSquared }
}

function computeCategoryElasticity(
  cat: string,
  catMonths: Record<string, number>,
  months: string[],
  monthlyIncome: Record<string, number>,
  minMonths: number,
): ElasticityResult | null {
  const incomeValues: number[] = []
  const spendingValues: number[] = []

  for (const m of months) {
    if (monthlyIncome[m] > 0 && catMonths[m] !== undefined) {
      incomeValues.push(monthlyIncome[m])
      spendingValues.push(catMonths[m])
    }
  }

  if (incomeValues.length < minMonths) return null

  const { slope, rSquared } = linearRegression(incomeValues, spendingValues)
  const meanIncome = incomeValues.reduce((a, b) => a + b, 0) / incomeValues.length
  const meanSpending = spendingValues.reduce((a, b) => a + b, 0) / spendingValues.length

  if (meanSpending === 0) return null

  const elasticity = (slope * meanIncome) / meanSpending

  let classification: ElasticityResult['classification']
  if (elasticity > 1.1) classification = 'elastic'
  else if (elasticity < 0.9) classification = 'inelastic'
  else classification = 'unit-elastic'

  return {
    category: cat,
    elasticity: Math.round(elasticity * 100) / 100,
    rSquared: Math.round(rSquared * 100) / 100,
    classification,
    avgMonthly: Math.round(meanSpending),
  }
}

export function computeElasticity(
  transactions: Array<{ type: string; category?: string; amount: number; date: string }>,
  minMonths = 6,
): ElasticityResult[] {
  // Build monthly income and per-category spending
  const monthlyIncome: Record<string, number> = {}
  const monthlyCatSpending: Record<string, Record<string, number>> = {}

  for (const tx of transactions) {
    const month = tx.date.substring(0, 7)
    if (tx.type === 'Income') {
      monthlyIncome[month] = (monthlyIncome[month] || 0) + Math.abs(tx.amount)
    } else if (tx.type === 'Expense') {
      const cat = tx.category || 'Other'
      if (!monthlyCatSpending[cat]) monthlyCatSpending[cat] = {}
      monthlyCatSpending[cat][month] = (monthlyCatSpending[cat][month] || 0) + Math.abs(tx.amount)
    }
  }

  const months = Object.keys(monthlyIncome).sort((a, b) => a.localeCompare(b))
  if (months.length < minMonths) return []

  const results: ElasticityResult[] = []

  for (const [cat, catMonths] of Object.entries(monthlyCatSpending)) {
    const result = computeCategoryElasticity(cat, catMonths, months, monthlyIncome, minMonths)
    if (result) results.push(result)
  }

  // Sort by elasticity descending (most elastic first)
  results.sort((a, b) => b.elasticity - a.elasticity)
  return results.slice(0, 8)
}

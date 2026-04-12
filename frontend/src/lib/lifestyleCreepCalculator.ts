/**
 * Lifestyle Creep Detection
 *
 * Compares per-category spending growth rate against income growth rate
 * over the last 6 months. Categories growing faster than income indicate
 * lifestyle inflation.
 *
 * creep_score = category_growth_rate - income_growth_rate
 * Positive = spending outpacing income (lifestyle creep)
 * Negative = spending growing slower than income (disciplined)
 */

interface MonthlyTotals {
  income: number
  categories: Record<string, number>
}

export interface CreepResult {
  category: string
  creepScore: number
  categoryGrowth: number
  incomeGrowth: number
  classification: 'accelerating' | 'stable' | 'declining'
  avgMonthly: number
}

function computeGrowthRate(values: number[]): number {
  if (values.length < 2) return 0
  const half = Math.floor(values.length / 2)
  const firstHalf = values.slice(0, half)
  const secondHalf = values.slice(half)
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
  if (firstAvg === 0) return secondAvg > 0 ? 100 : 0
  return ((secondAvg - firstAvg) / firstAvg) * 100
}

function computeCategoryCreep(
  cat: string,
  recentMonths: string[],
  monthlyData: Record<string, MonthlyTotals>,
  incomeGrowth: number,
): CreepResult | null {
  const values = recentMonths.map((m) => monthlyData[m].categories[cat] || 0)
  const total = values.reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const categoryGrowth = computeGrowthRate(values)
  const creepScore = categoryGrowth - incomeGrowth

  let classification: CreepResult['classification']
  if (creepScore > 5) classification = 'accelerating'
  else if (creepScore < -5) classification = 'declining'
  else classification = 'stable'

  return {
    category: cat,
    creepScore: Math.round(creepScore * 10) / 10,
    categoryGrowth: Math.round(categoryGrowth * 10) / 10,
    incomeGrowth: Math.round(incomeGrowth * 10) / 10,
    classification,
    avgMonthly: total / recentMonths.length,
  }
}

export function computeCreepScores(
  transactions: Array<{ type: string; category?: string; amount: number; date: string }>,
  minMonths = 4,
): CreepResult[] {
  // Build monthly data
  const monthlyData: Record<string, MonthlyTotals> = {}

  for (const tx of transactions) {
    const month = tx.date.substring(0, 7)
    if (!monthlyData[month]) monthlyData[month] = { income: 0, categories: {} }

    if (tx.type === 'Income') {
      monthlyData[month].income += Math.abs(tx.amount)
    } else if (tx.type === 'Expense') {
      const cat = tx.category || 'Other'
      monthlyData[month].categories[cat] = (monthlyData[month].categories[cat] || 0) + Math.abs(tx.amount)
    }
  }

  const months = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b))
  // Use the last 6 months (or whatever is available above minimum)
  const recentMonths = months.slice(-6)
  if (recentMonths.length < minMonths) return []

  // Income growth rate
  const incomeValues = recentMonths.map((m) => monthlyData[m].income)
  const incomeGrowth = computeGrowthRate(incomeValues)

  // Aggregate all categories across recent months
  const allCategories = new Set<string>()
  for (const m of recentMonths) {
    for (const cat of Object.keys(monthlyData[m].categories)) {
      allCategories.add(cat)
    }
  }

  // Compute creep score per category
  const results: CreepResult[] = []
  for (const cat of allCategories) {
    const result = computeCategoryCreep(cat, recentMonths, monthlyData, incomeGrowth)
    if (result) results.push(result)
  }

  // Sort by creep score descending (biggest lifestyle creep first)
  results.sort((a, b) => b.creepScore - a.creepScore)
  return results.slice(0, 10)
}

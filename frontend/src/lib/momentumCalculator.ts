/**
 * Category Momentum Calculator
 *
 * Computes 3-month moving average per category over the last 6 data points.
 * Slope classification: >5% growth = "accelerating", <-5% = "decelerating", else "stable".
 */

export interface CategoryMomentum {
  category: string
  sparklineData: number[]
  slope: number
  classification: 'accelerating' | 'stable' | 'decelerating'
  currentAvg: number
}

/**
 * Compute category momentum for all expense categories.
 *
 * @param transactions - All transactions
 * @param movingAvgMonths - Window for moving average (default 3)
 * @returns Map of category name -> momentum data
 */
export function computeCategoryMomentum(
  transactions: Array<{ type: string; category?: string; amount: number; date: string }>,
  movingAvgMonths = 3,
): Map<string, CategoryMomentum> {
  // Build monthly spending per category
  const monthlySpending: Record<string, Record<string, number>> = {}
  const allMonths = new Set<string>()

  for (const tx of transactions) {
    if (tx.type !== 'Expense') continue
    const cat = tx.category || 'Other'
    const month = tx.date.substring(0, 7)
    allMonths.add(month)
    if (!monthlySpending[cat]) monthlySpending[cat] = {}
    monthlySpending[cat][month] = (monthlySpending[cat][month] || 0) + Math.abs(tx.amount)
  }

  const months = [...allMonths].sort((a, b) => a.localeCompare(b))
  if (months.length < movingAvgMonths + 2) return new Map()

  const result = new Map<string, CategoryMomentum>()

  for (const [cat, catMonths] of Object.entries(monthlySpending)) {
    const values = months.map((m) => catMonths[m] || 0)

    // Compute moving averages
    const movingAvgs: number[] = []
    for (let i = movingAvgMonths - 1; i < values.length; i++) {
      const window = values.slice(i - movingAvgMonths + 1, i + 1)
      const avg = window.reduce((a, b) => a + b, 0) / movingAvgMonths
      movingAvgs.push(Math.round(avg))
    }

    // Take last 6 data points for sparkline
    const sparklineData = movingAvgs.slice(-6)
    if (sparklineData.length < 3) continue

    // Compute slope as % change from first to last
    const first = sparklineData[0]
    const last = sparklineData[sparklineData.length - 1]
    const slope = first > 0 ? ((last - first) / first) * 100 : (last > 0 ? 100 : 0)

    let classification: CategoryMomentum['classification']
    if (slope > 5) classification = 'accelerating'
    else if (slope < -5) classification = 'decelerating'
    else classification = 'stable'

    result.set(cat, {
      category: cat,
      sparklineData,
      slope: Math.round(slope * 10) / 10,
      classification,
      currentAvg: last,
    })
  }

  return result
}

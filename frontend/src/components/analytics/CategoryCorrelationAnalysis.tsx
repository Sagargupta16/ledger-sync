import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Grid3x3 } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { rawColors } from '@/constants/colors'

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length
  if (n === 0) return 0
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0)
  const sumX2 = x.reduce((s, xi) => s + xi * xi, 0)
  const sumY2 = y.reduce((s, yi) => s + yi * yi, 0)
  const denom = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2))
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
}

function getCorrelationColor(r: number): string {
  if (r > 0.5) return rawColors.ios.red
  if (r > 0.2) return rawColors.ios.orange
  if (r > -0.2) return '#6b7280'
  return rawColors.ios.blue
}

function getCorrelationBg(r: number): string {
  const abs = Math.abs(r)
  if (abs > 0.5) return `rgba(${r > 0 ? '239,68,68' : '59,130,246'}, ${abs * 0.4})`
  if (abs > 0.2) return `rgba(${r > 0 ? '249,115,22' : '59,130,246'}, ${abs * 0.3})`
  return 'rgba(107,114,128,0.1)'
}

interface Transaction {
  type: string
  date: string
  category?: string
  amount: number
}

function aggregateDailySpending(
  expenses: Transaction[],
  topCats: string[]
): Record<string, Record<string, number>> {
  const dailySpending: Record<string, Record<string, number>> = {}
  for (const tx of expenses) {
    const date = tx.date.substring(0, 10)
    const cat = tx.category || 'Other'
    if (!topCats.includes(cat)) continue
    if (!dailySpending[date]) dailySpending[date] = {}
    dailySpending[date][cat] = (dailySpending[date][cat] || 0) + Math.abs(tx.amount)
  }
  return dailySpending
}

function buildCorrelationMatrix(
  topCats: string[],
  dailySpending: Record<string, Record<string, number>>
): { matrix: number[][]; strongPairs: Array<{ catA: string; catB: string; r: number }> } {
  const dates = Object.keys(dailySpending).sort((a, b) => a.localeCompare(b))
  const matrix: number[][] = []
  const pairs: Array<{ catA: string; catB: string; r: number }> = []

  for (let i = 0; i < topCats.length; i++) {
    matrix[i] = []
    for (let j = 0; j < topCats.length; j++) {
      if (i === j) {
        matrix[i][j] = 1
      } else if (j < i) {
        matrix[i][j] = matrix[j][i]
      } else {
        const xVals = dates.map((d) => dailySpending[d]?.[topCats[i]] || 0)
        const yVals = dates.map((d) => dailySpending[d]?.[topCats[j]] || 0)
        const r = pearsonCorrelation(xVals, yVals)
        matrix[i][j] = r
        if (r > 0.3) pairs.push({ catA: topCats[i], catB: topCats[j], r })
      }
    }
  }

  pairs.sort((a, b) => b.r - a.r)
  return { matrix, strongPairs: pairs.slice(0, 3) }
}

export default function CategoryCorrelationAnalysis() {
  const { data: transactions = [] } = useTransactions()
  // Hover highlighting is handled via CSS :hover pseudo-class

  const { categories, matrix, strongPairs } = useMemo(() => {
    const expenses = transactions.filter((t) => t.type === 'Expense')
    if (expenses.length === 0) return { categories: [], matrix: [], strongPairs: [] }

    // Get top 8 expense categories
    const categoryTotals: Record<string, number> = {}
    for (const tx of expenses) {
      const cat = tx.category || 'Other'
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(tx.amount)
    }

    const topCats = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([cat]) => cat)

    if (topCats.length < 2) return { categories: [], matrix: [], strongPairs: [] }

    const dailySpending = aggregateDailySpending(expenses, topCats)
    const { matrix: correlationMatrix, strongPairs: pairs } = buildCorrelationMatrix(topCats, dailySpending)

    return { categories: topCats, matrix: correlationMatrix, strongPairs: pairs }
  }, [transactions])

  const truncate = (s: string, len: number) => (s.length > len ? `${s.substring(0, len - 1)}…` : s)

  if (categories.length < 2) {
    return (
      <motion.div
        className="glass rounded-2xl border border-white/10 p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-5">
          <Grid3x3 className="w-5 h-5 text-orange-400" />
          <h3 className="text-lg font-semibold text-white">Category Correlations</h3>
        </div>
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          Need at least 2 expense categories
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="glass rounded-2xl border border-white/10 p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Grid3x3 className="w-5 h-5 text-orange-400" />
        <h3 className="text-lg font-semibold text-white">Category Correlations</h3>
      </div>

      {/* Heatmap */}
      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Header row */}
          <div className="flex" style={{ marginLeft: 90 }}>
            {categories.map((cat) => (
              <div
                key={cat}
                className="text-xs text-gray-500 text-center"
                style={{ width: 50, transform: 'rotate(-45deg)', transformOrigin: 'left bottom', whiteSpace: 'nowrap' }}
              >
                {truncate(cat, 10)}
              </div>
            ))}
          </div>

          {/* Matrix rows */}
          <div className="mt-6 space-y-1">
            {categories.map((rowCat, i) => (
              <div key={rowCat} className="flex items-center gap-1">
                <span className="text-xs text-gray-500 w-[85px] text-right pr-2 flex-shrink-0 truncate" title={rowCat}>
                  {truncate(rowCat, 12)}
                </span>
                {categories.map((_, j) => {
                  const r = matrix[i][j]
                  return (
                    <div
                      key={`${rowCat}-${categories[j]}`}
                      className="relative flex items-center justify-center rounded transition-all hover:ring-1 hover:ring-white/30"
                      style={{
                        width: 50,
                        height: 32,
                        backgroundColor: i === j ? 'rgba(255,255,255,0.05)' : getCorrelationBg(r),
                      }}
                    >
                      <span
                        className="text-xs font-mono"
                        style={{ color: i === j ? 'rgba(255,255,255,0.3)' : getCorrelationColor(r) }}
                      >
                        {r.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Strong Pairs */}
      {strongPairs.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs text-gray-500 font-medium">Strong correlations (r &gt; 0.3):</p>
          {strongPairs.map((pair) => (
            <div key={`${pair.catA}-${pair.catB}`} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getCorrelationColor(pair.r) }} />
              <span className="text-gray-300">
                {pair.catA} &amp; {pair.catB}
              </span>
              <span className="text-gray-500 font-mono">r={pair.r.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 justify-center">
        {[
          { label: 'Strong +', color: rawColors.ios.red },
          { label: 'Weak +', color: rawColors.ios.orange },
          { label: 'Neutral', color: '#6b7280' },
          { label: 'Negative', color: rawColors.ios.blue },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

import { useMemo } from 'react'

import { motion } from 'framer-motion'
import { Users } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { useTotals } from '@/hooks/api/useAnalytics'
import { getBenchmarkForCategory } from '@/constants/benchmarks'
import { rawColors } from '@/constants/colors'
import StandardBarChart from '@/components/analytics/StandardBarChart'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

interface ComparisonItem {
  category: string
  you: number
  benchmark: number
}

export default function PeerComparisonBenchmarks() {
  const { data: transactions = [] } = useTransactions()
  const { data: totals } = useTotals()

  const data = useMemo(() => {
    const totalIncome = totals?.total_income ?? 0
    if (totalIncome <= 0) return []

    // Aggregate expenses by category
    const expenseByCategory: Record<string, number> = {}
    for (const tx of transactions) {
      if (tx.type !== 'Expense') continue
      const cat = tx.category || 'Other'
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Math.abs(tx.amount)
    }

    // Match against benchmarks and compute % of income
    const items: ComparisonItem[] = []
    for (const [cat, total] of Object.entries(expenseByCategory)) {
      const benchmarkPct = getBenchmarkForCategory(cat)
      if (benchmarkPct === undefined) continue
      const youPct = (total / totalIncome) * 100
      items.push({
        category: cat.length > 12 ? `${cat.substring(0, 10)}..` : cat,
        you: Math.round(youPct * 10) / 10,
        benchmark: benchmarkPct,
      })
    }

    // Sort by user spending descending, top 8
    items.sort((a, b) => b.you - a.you)
    return items.slice(0, 8)
  }, [transactions, totals])

  return (
    <motion.div
      className="glass rounded-2xl border border-border p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Users className="w-5 h-5 text-app-blue" />
        <h3 className="text-lg font-semibold text-white">How You Compare</h3>
      </div>

      <p className="text-xs text-text-tertiary mb-4">
        Your spending vs Indian urban household averages (NSS Survey, % of income)
      </p>

      {data.length === 0 ? (
        <ChartEmptyState height={280} message="Need income and categorized expense data" />
      ) : (
        <>
          <StandardBarChart
            data={data}
            dataKey="category"
            height={320}
            xAngle={-35}
            xHeight={60}
            yWidth={45}
            yTickFormatter={(v) => `${v}%`}
            tooltipFormatter={(v) => `${v}%`}
            margin={{ right: 20, left: 10 }}
            bars={[
              { key: 'you', label: 'You', color: rawColors.app.blue, barSize: 16 },
              {
                key: 'benchmark',
                label: 'Average',
                color: rawColors.app.purple,
                barSize: 16,
                fillOpacity: 0.5,
              },
            ]}
          />

          {/* Summary badges */}
          <div className="mt-4 flex flex-wrap gap-2">
            {data.map((item) => {
              const diff = item.you - item.benchmark
              const isOver = diff > 0
              return (
                <span
                  key={item.category}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{
                    backgroundColor: isOver ? `${rawColors.app.red}15` : `${rawColors.app.green}15`,
                    color: isOver ? rawColors.app.red : rawColors.app.green,
                  }}
                >
                  {item.category}: {isOver ? '+' : ''}{diff.toFixed(1)}%
                </span>
              )
            })}
          </div>
        </>
      )}
    </motion.div>
  )
}

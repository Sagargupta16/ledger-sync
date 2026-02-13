import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Shield } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import { CHART_AXIS_COLOR, CHART_GRID_COLOR } from '@/constants/chartColors'
import { chartTooltipProps } from '@/components/ui'

function getStabilityColor(score: number): string {
  if (score >= 70) return rawColors.ios.green
  if (score >= 40) return rawColors.ios.yellow
  return rawColors.ios.red
}

function getStabilityLabel(score: number): string {
  if (score >= 70) return 'Stable'
  if (score >= 40) return 'Moderate'
  return 'Volatile'
}

export default function IncomeStabilityIndex() {
  const { data: transactions = [] } = useTransactions()

  const { sources, overallScore } = useMemo(() => {
    const incomeByCategory: Record<string, Record<string, number>> = {}
    const allMonthsSet = new Set<string>()

    for (const tx of transactions) {
      if (tx.type !== 'Income') continue
      const cat = tx.category || 'Other'
      const month = tx.date.substring(0, 7)
      allMonthsSet.add(month)
      if (!incomeByCategory[cat]) incomeByCategory[cat] = {}
      incomeByCategory[cat][month] = (incomeByCategory[cat][month] || 0) + Math.abs(tx.amount)
    }

    const allMonths = [...allMonthsSet].sort((a, b) => a.localeCompare(b))
    if (allMonths.length < 2) return { sources: [], overallScore: 0 }

    const results: Array<{ name: string; score: number; mean: number; total: number }> = []
    let totalIncome = 0

    for (const [cat, monthData] of Object.entries(incomeByCategory)) {
      const values = allMonths.map((m) => monthData[m] || 0)
      const total = values.reduce((a, b) => a + b, 0)
      totalIncome += total
      const mean = total / values.length
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
      const stddev = Math.sqrt(variance)
      const cv = mean > 0 ? (stddev / mean) * 100 : 100
      const score = Math.max(0, Math.min(100, 100 - cv))
      results.push({ name: cat, score: Math.round(score), mean, total })
    }

    // Sort by total descending, keep top 8
    results.sort((a, b) => b.total - a.total)
    const topSources = results.slice(0, 8)

    // Weighted average
    const weighted = topSources.reduce((sum, s) => sum + s.score * s.total, 0)
    const overall = totalIncome > 0 ? Math.round(weighted / totalIncome) : 0

    return { sources: topSources, overallScore: overall }
  }, [transactions])

  const scoreColor = getStabilityColor(overallScore)

  return (
    <motion.div
      className="glass rounded-2xl border border-white/10 p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Shield className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-semibold text-white">Income Stability Index</h3>
      </div>

      {sources.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          Need at least 2 months of income data
        </div>
      ) : (
        <>
          {/* Overall Score */}
          <div className="flex items-center gap-4 mb-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white"
              style={{ backgroundColor: `${scoreColor}20`, boxShadow: `0 4px 20px ${scoreColor}30` }}
            >
              {overallScore}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: scoreColor }}>{getStabilityLabel(overallScore)}</p>
              <p className="text-xs text-gray-500">Overall income stability score (0-100)</p>
            </div>
          </div>

          {/* Chart */}
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={sources} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} stroke={CHART_AXIS_COLOR} tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} />
              <YAxis
                dataKey="name"
                type="category"
                width={120}
                stroke={CHART_AXIS_COLOR}
                tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
                tickFormatter={(v: string) => v.length > 15 ? `${v.substring(0, 12)}...` : v}
              />
              <Tooltip
                {...chartTooltipProps}
                formatter={(value: number | undefined, _name: string | undefined, entry: { payload?: { name: string; mean: number } }) => [
                  `${value ?? 0}/100 — Avg: ${formatCurrency(entry.payload?.mean ?? 0)}/mo`,
                  entry.payload?.name ?? '',
                ]}
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={20}>
                {sources.map((s) => (
                  <Cell key={s.name} fill={getStabilityColor(s.score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 justify-center">
            {[
              { label: 'Stable (70+)', color: rawColors.ios.green },
              { label: 'Moderate (40-70)', color: rawColors.ios.yellow },
              { label: 'Volatile (<40)', color: rawColors.ios.red },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-gray-500">{item.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  )
}

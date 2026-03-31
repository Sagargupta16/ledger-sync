import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Shield } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, shouldAnimate } from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

function getEmergencyFundMonths(cv: number): string {
  if (cv < 0.1) return '3-month'
  if (cv < 0.3) return '6-month'
  return '9-12 month'
}

function getCVDescription(cv: number): string {
  if (cv < 0.1) return ' -- Your income is highly predictable (salaried pattern)'
  if (cv < 0.3) return ' -- Moderate variability in income streams'
  return ' -- High variability suggests freelance/irregular income'
}

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

  const { sources, overallScore, overallCV } = useMemo(() => {
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
    if (allMonths.length < 2) return { sources: [], overallScore: 0, overallCV: 0 }

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
    // CV = (100 - score) / 100 for CFP classification
    const cv = (100 - overall) / 100

    return { sources: topSources, overallScore: overall, overallCV: cv }
  }, [transactions])

  const scoreColor = getStabilityColor(overallScore)

  return (
    <motion.div
      className="glass rounded-2xl border border-border p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Shield className="w-5 h-5 text-ios-blue" />
        <h3 className="text-lg font-semibold text-white">Income Stability Index</h3>
      </div>

      {sources.length === 0 ? (
        <ChartEmptyState height={192} message="Need at least 2 months of income data" />
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
              <p className="text-xs text-text-tertiary">Overall income stability score (0-100)</p>
            </div>
          </div>

          {/* Chart */}
          <ChartContainer height={280}>
            <BarChart data={sources} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid {...GRID_DEFAULTS} horizontal={false} />
              <XAxis {...xAxisDefaults(sources.length)} type="number" domain={[0, 100]} tickFormatter={undefined} />
              <YAxis
                {...yAxisDefaults({ currency: false, width: 120 })}
                dataKey="name"
                type="category"
                tickFormatter={(v: string) => v.length > 15 ? `${v.substring(0, 12)}...` : v}
              />
              <Tooltip
                {...chartTooltipProps}
                formatter={(value: number | undefined, _name: string | undefined, entry: { payload?: { name: string; mean: number } }) => [
                  `${value ?? 0}/100 — Avg: ${formatCurrency(entry.payload?.mean ?? 0)}/mo`,
                  entry.payload?.name ?? '',
                ]}
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={20} animationDuration={600} animationEasing="ease-out" isAnimationActive={shouldAnimate(sources.length)}>
                {sources.map((s) => (
                  <Cell key={s.name} fill={getStabilityColor(s.score)} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 justify-center">
            {[
              { label: 'Stable (70+)', color: rawColors.ios.green },
              { label: 'Moderate (40-70)', color: rawColors.ios.yellow },
              { label: 'Volatile (<40)', color: rawColors.ios.red },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-text-tertiary">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Emergency Fund Recommendation (CFP standard) */}
          <div
            className="mt-5 rounded-xl border p-4"
            style={{
              borderColor: `${scoreColor}30`,
              backgroundColor: `${scoreColor}08`,
            }}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: scoreColor }} />
              <div>
                <p className="text-sm font-medium text-white">
                  Recommended: {getEmergencyFundMonths(overallCV)} emergency fund
                </p>
                <p className="text-xs text-text-tertiary mt-1">
                  Coefficient of Variation: {(overallCV * 100).toFixed(1)}%
                  {getCVDescription(overallCV)}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  )
}

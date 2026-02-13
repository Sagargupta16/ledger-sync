import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Flag, CheckCircle, Circle } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency, formatCurrencyShort, formatDateTick } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { CHART_ANIMATION_THRESHOLD } from '@/constants'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { CHART_AXIS_COLOR, CHART_GRID_COLOR } from '@/constants/chartColors'
import { chartTooltipProps } from '@/components/ui'

const MILESTONES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000]

export default function SavingsMilestonesTimeline() {
  const { data: transactions = [] } = useTransactions()

  const { chartData, milestonesReached, maxSavings } = useMemo(() => {
    if (!transactions.length) return { chartData: [], milestonesReached: [], maxSavings: 0 }

    // Sort by date
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

    // Compute daily cumulative savings
    const dailyMap: Record<string, number> = {}
    let cumulative = 0

    for (const tx of sorted) {
      if (tx.type === 'Income') cumulative += Math.abs(tx.amount)
      else if (tx.type === 'Expense') cumulative -= Math.abs(tx.amount)
      dailyMap[tx.date.substring(0, 10)] = cumulative
    }

    const data = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, savings]) => ({ date, savings: Math.round(savings) }))

    // Find milestones reached
    const reached: Array<{ amount: number; date: string }> = []
    let nextIdx = 0
    for (const dp of data) {
      while (nextIdx < MILESTONES.length && dp.savings >= MILESTONES[nextIdx]) {
        reached.push({ amount: MILESTONES[nextIdx], date: dp.date })
        nextIdx++
      }
    }

    const max = data.length > 0 ? Math.max(...data.map((d) => d.savings)) : 0

    return { chartData: data, milestonesReached: reached, maxSavings: max }
  }, [transactions])

  // Only show milestones relevant to the data range
  const relevantMilestones = MILESTONES.filter((m) => m <= maxSavings * 1.5)

  return (
    <motion.div
      className="glass rounded-2xl border border-white/10 p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Flag className="w-5 h-5 text-green-400" />
        <h3 className="text-lg font-semibold text-white">Savings Milestones</h3>
        <span className="text-xs text-gray-500 ml-auto">{milestonesReached.length} milestones reached</span>
      </div>

      {chartData.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          No transaction data available
        </div>
      ) : (
        <>
          {/* Chart */}
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={rawColors.ios.green} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={rawColors.ios.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
              <XAxis
                dataKey="date"
                stroke={CHART_AXIS_COLOR}
                tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
                tickFormatter={(v) => formatDateTick(v, chartData.length)}
                angle={-45}
                textAnchor="end"
                height={80}
                interval={Math.max(1, Math.floor(chartData.length / 20))}
              />
              <YAxis
                stroke={CHART_AXIS_COLOR}
                tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
                tickFormatter={(value) => formatCurrencyShort(value)}
              />
              <Tooltip
                {...chartTooltipProps}
                labelFormatter={(label) =>
                  new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                }
                formatter={(value: number | undefined) => [formatCurrency(value ?? 0), 'Cumulative Savings']}
              />
              {/* Milestone reference lines */}
              {relevantMilestones.map((m) => (
                <ReferenceLine
                  key={m}
                  y={m}
                  stroke="rgba(255,255,255,0.15)"
                  strokeDasharray="6 4"
                  label={{
                    value: formatCurrencyShort(m),
                    position: 'right',
                    fill: '#6b7280',
                    fontSize: 10,
                  }}
                />
              ))}
              <Area
                type="natural"
                dataKey="savings"
                stroke={rawColors.ios.green}
                strokeWidth={2}
                fill="url(#savingsGradient)"
                isAnimationActive={chartData.length < CHART_ANIMATION_THRESHOLD}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Milestone Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            {MILESTONES.filter((m) => m <= maxSavings * 2 || milestonesReached.some((r) => r.amount === m)).slice(0, 8).map((milestone) => {
              const reached = milestonesReached.find((r) => r.amount === milestone)
              return (
                <div
                  key={milestone}
                  className={`p-3 rounded-xl border ${reached ? 'bg-green-500/5 border-green-500/20' : 'bg-white/[0.02] border-white/[0.06]'}`}
                >
                  <div className="flex items-center gap-2">
                    {reached ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                    )}
                    <span className={`text-sm font-medium ${reached ? 'text-green-400' : 'text-gray-500'}`}>
                      {formatCurrencyShort(milestone)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 ml-5.5">
                    {reached
                      ? new Date(reached.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                      : 'Not yet reached'}
                  </p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </motion.div>
  )
}

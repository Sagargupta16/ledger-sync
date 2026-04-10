import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { computeCreepScores } from '@/lib/lifestyleCreepCalculator'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine } from 'recharts'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, shouldAnimate } from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

function getCreepColor(score: number): string {
  if (score > 10) return rawColors.app.red
  if (score > 5) return rawColors.app.orange
  if (score > -5) return rawColors.app.yellow
  return rawColors.app.green
}

export default function LifestyleCreepDetection() {
  const { data: transactions = [] } = useTransactions()

  const results = useMemo(() => computeCreepScores(transactions), [transactions])

  const hasAlert = results.some((r) => r.creepScore > 10)

  const chartData = useMemo(() =>
    results.map((r) => ({
      name: r.category.length > 14 ? `${r.category.substring(0, 12)}..` : r.category,
      creep: r.creepScore,
      fullName: r.category,
      avgMonthly: r.avgMonthly,
      classification: r.classification,
    })),
  [results])

  return (
    <motion.div
      className="glass rounded-2xl border border-border p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="w-5 h-5 text-app-orange" />
        <h3 className="text-lg font-semibold text-white">Lifestyle Creep Detection</h3>
      </div>

      <p className="text-xs text-text-tertiary mb-4">
        Category spending growth vs income growth over the last 6 months
      </p>

      {hasAlert && (
        <div className="mb-4 p-3 rounded-xl border border-app-red/30 bg-app-red/[0.08]">
          <p className="text-sm text-app-red font-medium">
            {results.filter((r) => r.creepScore > 10).length} categories growing significantly faster than income
          </p>
        </div>
      )}

      {results.length === 0 ? (
        <ChartEmptyState height={280} message="Need at least 4 months of transaction data" />
      ) : (
        <>
          <ChartContainer height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid {...GRID_DEFAULTS} horizontal={false} />
              <XAxis
                {...xAxisDefaults(chartData.length)}
                type="number"
                tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`}
              />
              <YAxis
                {...yAxisDefaults({ currency: false, width: 120 })}
                dataKey="name"
                type="category"
                tickFormatter={undefined}
              />
              <ReferenceLine x={0} stroke={rawColors.text.tertiary} strokeDasharray="3 3" />
              <Tooltip
                {...chartTooltipProps}
                formatter={(value: number | undefined, _name: string | undefined, entry: { payload?: { fullName: string; avgMonthly: number; classification: string } }) => [
                  `${(value ?? 0) > 0 ? '+' : ''}${value ?? 0}% -- Avg: ${formatCurrency(entry.payload?.avgMonthly ?? 0)}/mo (${entry.payload?.classification ?? ''})`,
                  entry.payload?.fullName ?? '',
                ]}
              />
              <Bar dataKey="creep" radius={[0, 4, 4, 0]} barSize={18} animationDuration={600} animationEasing="ease-out" isAnimationActive={shouldAnimate(chartData.length)}>
                {chartData.map((d) => (
                  <Cell key={d.name} fill={getCreepColor(d.creep)} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 justify-center flex-wrap">
            {[
              { label: 'Accelerating (>5%)', color: rawColors.app.red },
              { label: 'Stable', color: rawColors.app.yellow },
              { label: 'Declining (<-5%)', color: rawColors.app.green },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-text-tertiary">{item.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  )
}

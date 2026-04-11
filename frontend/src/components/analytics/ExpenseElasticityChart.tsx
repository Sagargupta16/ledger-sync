import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { computeElasticity } from '@/lib/elasticityCalculator'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine } from 'recharts'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, shouldAnimate } from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

function getElasticityColor(e: number): string {
  if (e > 1.5) return rawColors.app.red
  if (e > 1.1) return rawColors.app.orange
  if (e > 0.9) return rawColors.app.yellow
  return rawColors.app.green
}

function getClassLabel(c: string): string {
  if (c === 'elastic') return 'Luxury'
  if (c === 'inelastic') return 'Necessity'
  return 'Proportional'
}

export default function ExpenseElasticityChart() {
  const { data: transactions = [] } = useTransactions()

  const results = useMemo(() => computeElasticity(transactions), [transactions])

  const chartData = useMemo(() =>
    results.map((r) => ({
      name: r.category.length > 14 ? `${r.category.substring(0, 12)}..` : r.category,
      elasticity: r.elasticity,
      fullName: r.category,
      avgMonthly: r.avgMonthly,
      rSquared: r.rSquared,
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
        <Zap className="w-5 h-5 text-app-yellow" />
        <h3 className="text-lg font-semibold text-white">Expense Elasticity</h3>
      </div>

      <p className="text-xs text-text-tertiary mb-4">
        How each category responds to income changes (elasticity &gt; 1 = luxury, &lt; 1 = necessity)
      </p>

      {results.length === 0 ? (
        <ChartEmptyState height={280} message="Need at least 6 months of income and expense data" />
      ) : (
        <>
          <ChartContainer height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 10 }}>
              <CartesianGrid {...GRID_DEFAULTS} horizontal={false} />
              <XAxis
                {...xAxisDefaults(chartData.length)}
                type="number"
                domain={[0, 'auto']}
                tickFormatter={(v: number) => `${v.toFixed(1)}`}
              />
              <YAxis
                {...yAxisDefaults({ currency: false, width: 120 })}
                dataKey="name"
                type="category"
                tickFormatter={undefined}
              />
              <ReferenceLine x={1} stroke={rawColors.text.tertiary} strokeDasharray="3 3" label={{ value: 'Unit', fill: rawColors.text.tertiary, fontSize: 10 }} />
              <Tooltip
                {...chartTooltipProps}
                formatter={(value: number | undefined, _name: string | undefined, entry: { payload?: { fullName: string; avgMonthly: number; rSquared: number; classification: string } }) => [
                  `${(value ?? 0).toFixed(2)} (${getClassLabel(entry.payload?.classification ?? '')}) -- Avg: ${formatCurrency(entry.payload?.avgMonthly ?? 0)}/mo, R2: ${entry.payload?.rSquared ?? 0}`,
                  entry.payload?.fullName ?? '',
                ]}
              />
              <Bar dataKey="elasticity" radius={[0, 4, 4, 0]} barSize={18} animationDuration={600} animationEasing="ease-out" isAnimationActive={shouldAnimate(chartData.length)}>
                {chartData.map((d) => (
                  <Cell key={d.name} fill={getElasticityColor(d.elasticity)} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>

          {/* Summary badges */}
          <div className="mt-4 flex flex-wrap gap-2">
            {results.map((r) => (
              <span
                key={r.category}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{
                  backgroundColor: `${getElasticityColor(r.elasticity)}15`,
                  color: getElasticityColor(r.elasticity),
                }}
              >
                {r.category}: {r.elasticity.toFixed(2)} ({getClassLabel(r.classification)})
              </span>
            ))}
          </div>
        </>
      )}
    </motion.div>
  )
}

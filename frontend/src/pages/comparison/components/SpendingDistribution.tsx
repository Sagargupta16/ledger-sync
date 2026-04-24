import { motion } from 'framer-motion'
import {
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  CartesianGrid,
} from 'recharts'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { chartTooltipProps, ChartContainer, shouldAnimate, GRID_DEFAULTS } from '@/components/ui'
import { CHART_AXIS_COLOR } from '@/constants/chartColors'
import type { PeriodSummary } from '../types'

interface SpendingDistributionProps {
  periodA: PeriodSummary
  periodB: PeriodSummary
  distributionA: Array<{ name: string; value: number }>
  distributionB: Array<{ name: string; value: number }>
}

export function SpendingDistribution({
  periodA, periodB, distributionA, distributionB,
}: Readonly<SpendingDistributionProps>) {
  if (distributionA.length === 0 && distributionB.length === 0) return null

  // Merge both periods into butterfly chart data
  const categorySet = new Set([...distributionA.map((d) => d.name), ...distributionB.map((d) => d.name)])
  const aMap = Object.fromEntries(distributionA.map((d) => [d.name, d.value]))
  const bMap = Object.fromEntries(distributionB.map((d) => [d.name, d.value]))
  const butterflyData = Array.from(categorySet)
    .map((name) => ({
      name,
      periodA: -(aMap[name] || 0), // negative = extends left
      periodB: bMap[name] || 0,     // positive = extends right
    }))
    .sort((a, b) => Math.max(Math.abs(b.periodA), b.periodB) - Math.max(Math.abs(a.periodA), a.periodB))
    .slice(0, 10) // top 10 categories
  const maxVal = Math.max(
    ...butterflyData.map((d) => Math.abs(d.periodA)),
    ...butterflyData.map((d) => d.periodB),
    1,
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <h2 className="text-lg font-semibold mb-1">Spending Distribution</h2>
      <p className="text-xs text-text-tertiary mb-2">Category-by-category comparison — bars extend left and right from center</p>
      <div className="flex items-center justify-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: rawColors.app.blue }} />
          <span className="text-xs text-muted-foreground">{periodA.label} (left)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: rawColors.app.indigo }} />
          <span className="text-xs text-muted-foreground">{periodB.label} (right)</span>
        </div>
      </div>
      <div style={{ height: Math.max(300, butterflyData.length * 36) }}>
        <ChartContainer>
          <BarChart data={butterflyData} layout="vertical" stackOffset="sign" margin={{ top: 8, right: 12, bottom: 8, left: 10 }}>
            <CartesianGrid {...GRID_DEFAULTS} horizontal={false} vertical={true} />
            <XAxis
              type="number"
              domain={[-maxVal, maxVal]}
              tick={{ fill: CHART_AXIS_COLOR, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255, 255, 255, 0.06)' }}
              tickFormatter={(v: number) => formatCurrencyShort(Math.abs(v))}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255, 255, 255, 0.06)' }}
            />
            <Tooltip
              {...chartTooltipProps}
              formatter={(value: number | undefined) => value === undefined ? '' : formatCurrency(Math.abs(value))}
              labelFormatter={(label) => label}
            />
            <Bar dataKey="periodA" name={periodA.label} stackId="stack" radius={[4, 0, 0, 4]} isAnimationActive={shouldAnimate(butterflyData.length)} animationDuration={600} animationEasing="ease-out">
              {butterflyData.map((entry) => (
                <Cell key={`a-${entry.name}`} fill={rawColors.app.blue} />
              ))}
            </Bar>
            <Bar dataKey="periodB" name={periodB.label} stackId="stack" radius={[0, 4, 4, 0]} isAnimationActive={shouldAnimate(butterflyData.length)} animationDuration={600} animationEasing="ease-out">
              {butterflyData.map((entry) => (
                <Cell key={`b-${entry.name}`} fill={rawColors.app.indigo} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </motion.div>
  )
}

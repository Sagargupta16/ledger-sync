import { useMemo } from 'react'

import { motion } from 'framer-motion'
import { TrendingDown } from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { rawColors } from '@/constants/colors'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import {
  ChartContainer,
  GRID_DEFAULTS,
  LEGEND_DEFAULTS,
  chartTooltipProps,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'

interface ParetoChartProps {
  /**
   * Map of category name -> total spent. The component sorts internally
   * (descending) and computes the cumulative % line.
   */
  readonly categoryBreakdown: Record<string, number>
  readonly height?: number
  /** Cumulative-% threshold to draw a horizontal reference line at. */
  readonly threshold?: number
  /** Cap on number of bars shown (long tail rolled into "Other"). */
  readonly maxBars?: number
}

interface ParetoRow {
  category: string
  amount: number
  cumulative: number
  cumulativePct: number
}

/**
 * Pareto chart for category spending.
 *
 * Sorts categories descending by spend, draws each as a bar, and overlays
 * a cumulative-percentage line on a secondary y-axis. A reference line at
 * the configured threshold (default 80 %) shows the "few that contribute
 * most" boundary -- the classic 80/20 Pareto question.
 *
 * Long tails (>maxBars categories) collapse into a single "Other" bucket
 * so the x-axis stays readable on dense data.
 */
export default function ParetoChart({
  categoryBreakdown,
  height = 320,
  threshold = 80,
  maxBars = 12,
}: ParetoChartProps) {
  const data = useMemo<ParetoRow[]>(() => {
    const sorted = Object.entries(categoryBreakdown)
      .map(([category, amount]) => ({ category, amount: Math.abs(amount) }))
      .sort((a, b) => b.amount - a.amount)

    if (sorted.length === 0) return []

    // Roll the long tail into "Other" so the x-axis doesn't get crowded.
    let head = sorted
    if (sorted.length > maxBars) {
      const visible = sorted.slice(0, maxBars - 1)
      const otherTotal = sorted
        .slice(maxBars - 1)
        .reduce((sum, r) => sum + r.amount, 0)
      head = [...visible, { category: 'Other', amount: otherTotal }]
    }

    const total = head.reduce((sum, r) => sum + r.amount, 0)
    if (total === 0) return []

    let running = 0
    return head.map((r) => {
      running += r.amount
      return {
        category: r.category,
        amount: r.amount,
        cumulative: running,
        cumulativePct: (running / total) * 100,
      }
    })
  }, [categoryBreakdown, maxBars])

  if (data.length === 0) return null

  // Find the bar where cumulative crosses the threshold -- used to colour
  // the "vital few" bars differently from the "trivial many".
  const thresholdIndex = data.findIndex((r) => r.cumulativePct >= threshold)
  const vitalFewCount = thresholdIndex < 0 ? data.length : thresholdIndex + 1

  const animate = shouldAnimate(data.length)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-app-orange/15">
          <TrendingDown className="w-5 h-5 text-app-orange" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Pareto Analysis</h3>
          <p className="text-xs text-text-tertiary">
            {vitalFewCount} {vitalFewCount === 1 ? 'category' : 'categories'} make up{' '}
            {threshold}% of your spend -- the rest are the long tail
          </p>
        </div>
      </div>
      <ChartContainer height={height}>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 24, bottom: 8, left: 4 }}
        >
          <CartesianGrid {...GRID_DEFAULTS} />
          <XAxis
            dataKey="category"
            {...xAxisDefaults(data.length, { angle: -30, height: 70 })}
            interval={0}
            tickFormatter={(value: string) =>
              value.length > 14 ? `${value.slice(0, 12)}...` : value
            }
          />
          <YAxis
            yAxisId="left"
            {...yAxisDefaults()}
            tickFormatter={formatCurrencyShort}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            stroke={rawColors.text.tertiary}
            tick={{ fill: rawColors.text.tertiary, fontSize: 11 }}
          />
          <Tooltip
            {...chartTooltipProps}
            formatter={((value: number | undefined, name: string | undefined) => {
              const v = value ?? 0
              return name === 'cumulativePct'
                ? `${v.toFixed(1)}%`
                : formatCurrency(v)
            }) as never}
          />
          <Legend {...LEGEND_DEFAULTS} />
          {/* Vital-few bars (orange) vs trivial-many (muted) */}
          <Bar
            yAxisId="left"
            dataKey="amount"
            name="Spend"
            fill={rawColors.app.orange}
            radius={[4, 4, 0, 0]}
            isAnimationActive={animate}
            animationDuration={600}
            animationEasing="ease-out"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulativePct"
            name="Cumulative %"
            stroke={rawColors.app.blue}
            strokeWidth={2}
            dot={{ r: 3, fill: rawColors.app.blue }}
            activeDot={{ r: 5 }}
            isAnimationActive={animate}
            animationDuration={800}
          />
          <ReferenceLine
            yAxisId="right"
            y={threshold}
            stroke={rawColors.text.tertiary}
            strokeDasharray="4 4"
            label={{
              value: `${threshold}%`,
              fill: rawColors.text.secondary,
              fontSize: 11,
              position: 'right',
            }}
          />
        </ComposedChart>
      </ChartContainer>
    </motion.div>
  )
}

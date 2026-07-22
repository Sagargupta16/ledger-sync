import { motion } from 'framer-motion'
import { LineChart } from 'lucide-react'
import { Area, AreaChart, Brush, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  BRUSH_DEFAULTS,
  ChartContainer,
  GRID_DEFAULTS,
  LEGEND_DEFAULTS,
  chartTooltipProps,
  currencyTooltipFormatter,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatDate } from '@/lib/formatters'

import { CATEGORY_COLORS, INVESTMENT_CATEGORIES } from '../investmentUtils'

interface GrowthOverTimeChartProps {
  isLoading: boolean
  filteredGrowthData: Array<Record<string, string | number>>
}

export function GrowthOverTimeChart({
  isLoading,
  filteredGrowthData,
}: Readonly<GrowthOverTimeChartProps>) {
  const dims = useChartDimensions()
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <LineChart className="w-5 h-5 text-app-purple" />
        <h3 className="text-lg font-semibold text-foreground">Investment Growth Over Time</h3>
      </div>
      {isLoading && <ChartSkeleton />}
      {!isLoading &&
        (filteredGrowthData.length === 0 ? (
          <ChartEmptyState height={400} />
        ) : (
          <ChartContainer
            height={400}
            ariaLabel="Stacked area chart of investment value over time, split by asset class."
          >
            <AreaChart data={filteredGrowthData}>
              <defs>
                {INVESTMENT_CATEGORIES.map((category) => (
                  <linearGradient
                    key={`gradient-${category}`}
                    id={`color-${category.replaceAll(/[\s/]/g, '-')}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={CATEGORY_COLORS[category]} stopOpacity={0.55} />
                    <stop offset="95%" stopColor={CATEGORY_COLORS[category]} stopOpacity={0.15} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid {...GRID_DEFAULTS} />
              <XAxis
                {...xAxisDefaults(filteredGrowthData.length, {
                  angle: dims.angleXLabels ? -45 : undefined,
                  height: 80,
                  dateFormatter: true,
                })}
                dataKey="date"
              />
              <YAxis {...yAxisDefaults()} />
              <Tooltip
                {...chartTooltipProps}
                formatter={(value, name) => [currencyTooltipFormatter(value), name || '']}
                // recharts 3.10 widened labelFormatter's label to ReactNode.
                labelFormatter={(label) =>
                  formatDate(String(label), {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })
                }
              />
              <Legend {...LEGEND_DEFAULTS} />
              {INVESTMENT_CATEGORIES.map((category) => (
                <Area
                  key={category}
                  type="monotone"
                  dataKey={category}
                  stackId="1"
                  stroke={CATEGORY_COLORS[category]}
                  strokeWidth={2}
                  dot={false}
                  fillOpacity={1}
                  fill={`url(#color-${category.replaceAll(/[\s/]/g, '-')})`}
                  isAnimationActive={shouldAnimate(filteredGrowthData.length)}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              ))}
              {/* Drag-to-zoom across the timeline. Default window is the most
                  recent third so the chart reads at full fidelity on first
                  paint without forcing the user to scroll. */}
              {filteredGrowthData.length > 6 && (
                <Brush
                  {...BRUSH_DEFAULTS}
                  dataKey="date"
                  tickFormatter={(value: string) =>
                    formatDate(value, { month: 'short', year: '2-digit' })
                  }
                  startIndex={Math.max(
                    0,
                    filteredGrowthData.length - Math.ceil(filteredGrowthData.length / 3),
                  )}
                />
              )}
            </AreaChart>
          </ChartContainer>
        ))}
    </motion.div>
  )
}

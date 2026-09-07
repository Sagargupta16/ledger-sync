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
import { tooltipLabelString } from '@/lib/chartUtils'
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
  const animateSeries = shouldAnimate(filteredGrowthData.length * INVESTMENT_CATEGORIES.length)

  return (
    <section className="ledger-panel p-4 sm:p-5" aria-labelledby="investment-growth-title">
      <div className="mb-4 flex items-center gap-2.5">
        <LineChart className="size-5 text-app-purple" aria-hidden="true" />
        <h2 id="investment-growth-title" className="text-base font-semibold text-foreground">
          Investment Growth Over Time
        </h2>
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
              <YAxis {...yAxisDefaults({ width: dims.breakpoint === 'mobile' ? 48 : 60 })} />
              <Tooltip
                {...chartTooltipProps}
                formatter={(value, name) => [currencyTooltipFormatter(value), name || '']}
                // recharts 3.10 widened labelFormatter's label to ReactNode; at
                // runtime it is the `date` axis tick value. formatDate returns
                // its input unchanged for anything that is not YYYY-MM-DD.
                labelFormatter={(label) =>
                  formatDate(tooltipLabelString(label), {
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
                  isAnimationActive={animateSeries}
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
    </section>
  )
}

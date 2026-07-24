import { motion } from 'framer-motion'
import {
  Tooltip as RechartsTooltip,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
  ReferenceLine,
} from 'recharts'

import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import {
  chartTooltipProps,
  ChartContainer,
  GRID_DEFAULTS,
  xAxisDefaults,
  yAxisDefaults,
  shouldAnimate,
  BAR_RADIUS,
} from '@/components/ui'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import type { useChartDimensions } from '@/hooks/useChartDimensions'
import type { useYearInReview } from '../useYearInReview'

type MonthlyBarData = ReturnType<typeof useYearInReview>['monthlyBarData']
type ChartDimensions = ReturnType<typeof useChartDimensions>

interface MonthlyBreakdownChartProps {
  readonly monthlyBarData: MonthlyBarData
  readonly dims: ChartDimensions
}

export default function MonthlyBreakdownChart({ monthlyBarData, dims }: MonthlyBreakdownChartProps) {
  const xAxisOptions = dims.angleXLabels && monthlyBarData.length > 6
    ? { angle: -45, height: 50 }
    : undefined

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="lg:col-span-2 glass rounded-2xl border border-border p-4 sm:p-6"
    >
      <h2 className="text-lg font-semibold mb-4">Monthly Breakdown</h2>
      <p className="text-xs text-text-tertiary mb-4">Income, spending, and net cash flow each month</p>
      <div className="h-60 sm:h-72">
        {monthlyBarData.every((d) => d.Spending === 0 && d.Earning === 0) ? (
          <ChartEmptyState height={288} />
        ) : (
          <ChartContainer ariaLabel="Monthly breakdown -- income and spending bars with a net cash flow line per month, against a break-even baseline">
            <ComposedChart data={monthlyBarData} barGap={4}>
              <CartesianGrid {...GRID_DEFAULTS} />
              {/* Angle the month labels only when the density check says so
                  (mobile/tablet) and there are enough months to collide --
                  keeps the desktop chart's flat labels untouched. */}
              <XAxis
                {...xAxisDefaults(
                  monthlyBarData.length,
                  xAxisOptions,
                )}
                dataKey="name"
              />
              <YAxis {...yAxisDefaults()} />
              <RechartsTooltip
                {...chartTooltipProps}
                formatter={(value) =>
                  typeof value === 'number' ? formatCurrency(value) : ''
                }
              />
              {/* Break-even baseline -- emphasized so the Net line's
                  sign crossing (saving above, overspending below) reads at
                  a glance against the income/spend bars. */}
              <ReferenceLine
                y={0}
                stroke={rawColors.chart.referenceLineStrong}
                strokeWidth={1.5}
                label={{
                  value: 'Break-even',
                  position: 'insideTopLeft',
                  fill: rawColors.text.tertiary,
                  fontSize: 10,
                }}
              />
              <Bar
                dataKey="Spending"
                fill={rawColors.app.red}
                radius={BAR_RADIUS}
                opacity={0.8}
                isAnimationActive={shouldAnimate(monthlyBarData.length)}
                animationDuration={600}
                animationEasing="ease-out"
              >
                {dims.showBarLabels && (
                  <LabelList
                    dataKey="Spending"
                    position="top"
                    fill={rawColors.chart.textPrimary}
                    fontSize={10}
                    formatter={(v: unknown) =>
                      !v || v === 0 ? '' : formatCurrencyShort(v as number)
                    }
                  />
                )}
              </Bar>
              <Bar
                dataKey="Earning"
                fill={rawColors.app.green}
                radius={BAR_RADIUS}
                opacity={0.8}
                isAnimationActive={shouldAnimate(monthlyBarData.length)}
                animationDuration={600}
                animationEasing="ease-out"
              >
                {dims.showBarLabels && (
                  <LabelList
                    dataKey="Earning"
                    position="top"
                    fill={rawColors.chart.textPrimary}
                    fontSize={10}
                    formatter={(v: unknown) =>
                      !v || v === 0 ? '' : formatCurrencyShort(v as number)
                    }
                  />
                )}
              </Bar>
              {/* Net cash flow line so savings months pop visually --
                  a peak above the bars means a saving month, a trough
                  between them means an overspending month. */}
              <Line
                type="monotone"
                dataKey="Net"
                stroke={rawColors.app.blue}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ r: 3, fill: rawColors.app.blue, stroke: 'none' }}
                activeDot={{ r: 5, fill: rawColors.app.blue, stroke: rawColors.chart.activeStroke, strokeWidth: 2 }}
                isAnimationActive={shouldAnimate(monthlyBarData.length)}
                animationDuration={700}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </div>
    </motion.div>
  )
}

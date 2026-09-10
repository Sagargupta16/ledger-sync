import { motion } from 'motion/react'
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
import { SCROLL_FADE_UP } from '@/constants/animations'
import { chartDataTable } from '@/components/ui/chartDataTable'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import {
  chartTooltipProps,
  ChartContainer,
  GRID_DEFAULTS,
  xAxisDefaults,
  yAxisDefaults,
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
  const { animate } = useChartPresentation(monthlyBarData.length)
  const xAxisOptions = dims.angleXLabels && monthlyBarData.length > 6
    ? { angle: -45, height: 50 }
    : undefined

  return (
    <motion.div
      {...SCROLL_FADE_UP}
      className="ledger-panel min-w-0 p-4 sm:p-6"
    >
      <p className="ledger-meta mb-2 text-app-blue">The year, month by month</p>
      <h2 className="text-xl font-semibold tracking-tight">Monthly Breakdown</h2>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">Income, spending, and net cash flow each month</p>
      <div className="border-y border-border/60 py-3 [&>div]:mb-0">
        <ChartSeriesLegend
          items={[
            { key: 'income', label: 'Income', color: rawColors.app.green },
            { key: 'spending', label: 'Spending', color: rawColors.app.red },
            { key: 'net', label: 'Net cash flow', color: rawColors.app.blue },
          ]}
          caption="Bars: in / out · Line: net"
        />
      </div>
      <div className="mt-5 min-w-0">
        {monthlyBarData.every((d) => d.Spending === 0 && d.Earning === 0) ? (
          <ChartEmptyState height={dims.breakpoint === 'mobile' ? 280 : 340} />
        ) : (
          <>
            <ChartContainer height={340} mobileHeight={280} ariaLabel="Monthly breakdown -- income and spending bars with a net cash flow line per month, against a break-even baseline">
              <ComposedChart
                data={monthlyBarData}
                barGap={4}
                barCategoryGap="24%"
                margin={{ top: 20, right: 12, bottom: 8, left: 0 }}
              >
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
                <YAxis {...yAxisDefaults({ width: dims.breakpoint === 'mobile' ? 56 : 64 })} domain={['auto', 'auto']} />
                <RechartsTooltip
                  {...chartTooltipProps}
                  content={<ChartTooltipContent />}
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
                />
                <Bar
                  dataKey="Spending"
                  fill={rawColors.app.red}
                  radius={BAR_RADIUS}
                  maxBarSize={28}
                  opacity={0.9}
                  isAnimationActive={animate}
                  animationDuration={700}
                  animationEasing="ease-out"
                >
                  {dims.showBarLabels && monthlyBarData.length <= 6 && (
                    <LabelList
                      dataKey="Spending"
                      position="top"
                      fill={rawColors.chart.textPrimary}
                      fontSize={11}
                      fontFamily="var(--font-mono)"
                      formatter={(v: unknown) =>
                        !v || v === 0 ? '' : formatCurrencyShort(v as number)
                      }
                    />
                  )}
                </Bar>
                <Bar
                  dataKey="Earning"
                  name="Income"
                  fill={rawColors.app.green}
                  radius={BAR_RADIUS}
                  maxBarSize={28}
                  opacity={0.9}
                  isAnimationActive={animate}
                  animationDuration={700}
                  animationEasing="ease-out"
                >
                  {dims.showBarLabels && monthlyBarData.length <= 6 && (
                    <LabelList
                      dataKey="Earning"
                      position="top"
                      fill={rawColors.chart.textPrimary}
                      fontSize={11}
                      fontFamily="var(--font-mono)"
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
                  name="Net cash flow"
                  stroke={rawColors.app.blue}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: rawColors.app.blue, stroke: 'none' }}
                  activeDot={{ r: 5, fill: rawColors.app.blue, stroke: rawColors.chart.activeStroke, strokeWidth: 2 }}
                  isAnimationActive={animate}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
              </ComposedChart>
            </ChartContainer>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-px w-5 bg-muted-foreground" aria-hidden="true" />{' '}
              Break-even at zero. Net cash flow below this line is a deficit.
            </p>
            {chartDataTable(
              monthlyBarData,
              [
                { header: 'Month', rowHeader: true, value: (row) => row.name },
                { header: 'Income', value: (row) => formatCurrency(row.Earning) },
                { header: 'Spending', value: (row) => formatCurrency(row.Spending) },
                { header: 'Net cash flow', value: (row) => formatCurrency(row.Net) },
              ],
              'Year in review monthly breakdown',
              (row) => row.name,
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

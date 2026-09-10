import { motion } from 'motion/react'
import { TrendingUp } from 'lucide-react'
import { Area, ComposedChart, CartesianGrid, Line, Tooltip, XAxis, YAxis } from 'recharts'

import EmptyState from '@/components/shared/EmptyState'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { CHART_LINE_CURSOR_STYLE } from '@/components/ui/ChartTooltip'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import {
  ACTIVE_DOT,
  ChartContainer,
  GRID_DEFAULTS,
  areaGradient,
  areaGradientUrl,
  chartTooltipProps,
  currencyTooltipFormatter,
  referenceLine,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { rollingAvgCaption } from '@/lib/chartUtils'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/formatters'

import type { MonthlyIncomeDatum } from '../useIncomeAnalysis'

interface IncomeTrendSectionProps {
  readonly data: readonly MonthlyIncomeDatum[]
  /**
   * `undefined` when the only month on the chart is the one in progress -- a
   * running total is not a peak, so the reference line is omitted rather than
   * drawn across the single partial bar.
   */
  readonly peakIncome: number | undefined
  readonly avgIncome: number
  /** Count of months that have a real rolling average (not the data length). */
  readonly rollingAvgPointCount: number
  readonly rollingAvgMonths: number
}

export default function IncomeTrendSection({
  data,
  peakIncome,
  avgIncome,
  rollingAvgPointCount,
  rollingAvgMonths,
}: IncomeTrendSectionProps) {
  const dimensions = useChartDimensions()
  const { animate } = useChartPresentation(data.length)

  return (
    <motion.section
      className="ledger-panel min-w-0 p-4 sm:p-6"
      {...SCROLL_FADE_UP}
      aria-labelledby="income-trend-title"
    >
      <div className="space-y-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 max-w-xl">
            <div className="mb-2 flex items-center gap-2 text-app-green">
              <TrendingUp className="size-4 shrink-0" aria-hidden="true" />
              <p className="ledger-meta">Income over time</p>
            </div>
            <h2 id="income-trend-title" className="text-xl font-semibold tracking-tight text-foreground">
              Income Trend
            </h2>
            <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
              Monthly income with a {rollingAvgMonths}-month rolling average.{' '}
              {rollingAvgCaption(rollingAvgPointCount, rollingAvgMonths)}
            </p>
          </div>
          {data.length > 0 && (
            <dl className="shrink-0 border-t border-border pt-3 sm:border-0 sm:pt-0 sm:text-right">
              <dt className="text-xs text-muted-foreground">Average monthly income</dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-app-green">
                {formatCurrency(avgIncome)}
              </dd>
            </dl>
          )}
        </div>

        {data.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-border/60 py-3">
              <ul aria-label="Income chart series" className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-0.5 w-5 rounded-full bg-app-green" aria-hidden="true" />
                  Monthly income
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 border-t-2 border-dashed" style={{ borderColor: rawColors.app.blue }} aria-hidden="true" />
                  {rollingAvgMonths}-month average
                </li>
              </ul>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {data[0].label} to {data.at(-1)?.label}
              </p>
            </div>
            <ChartContainer
              height={360}
              mobileHeight={260}
              ariaLabel={`Monthly income over time with a ${rollingAvgMonths}-month rolling average, plus peak and average reference lines`}
            >
              <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
                <defs>{areaGradient('incomeTrend', rawColors.app.green, 0.24, 0.01)}</defs>
                <CartesianGrid {...GRID_DEFAULTS} />
                <XAxis
                  {...xAxisDefaults(data.length)}
                  dataKey="label"
                  interval={dimensions.breakpoint === 'mobile' ? 'preserveStartEnd' : xAxisDefaults(data.length).interval}
                />
                <YAxis {...yAxisDefaults({ width: dimensions.breakpoint === 'mobile' ? 56 : 64 })} />
                <Tooltip
                  {...chartTooltipProps}
                  content={<ChartTooltipContent />}
                  cursor={CHART_LINE_CURSOR_STYLE}
                  labelFormatter={(
                    _label: unknown,
                    payload: ReadonlyArray<{ payload?: { month?: string } }>,
                  ) => {
                    const month = payload?.[0]?.payload?.month
                    return month ? formatMonthKey(month, { month: 'long', year: 'numeric' }) : ''
                  }}
                  formatter={(value, name) => [
                    currencyTooltipFormatter(value),
                    name === `Income (${rollingAvgMonths}m avg)`
                      ? `Income (${rollingAvgMonths}m avg)`
                      : 'Income',
                  ]}
                  itemSorter={(item) => -(item.value as number)}
                />
                {peakIncome !== undefined &&
                  referenceLine({
                    y: peakIncome,
                    variant: 'peak',
                  })}
                {avgIncome > 0 &&
                  referenceLine({
                    y: avgIncome,
                    variant: 'avg',
                  })}
                <Area
                  type="monotone"
                  dataKey="income"
                  name="Income"
                  stroke={rawColors.app.green}
                  fill={areaGradientUrl('incomeTrend')}
                  strokeWidth={2.5}
                  dot={data.length === 1 ? { r: 4, fill: rawColors.app.green } : false}
                  activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.green }}
                  isAnimationActive={animate}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="incomeAvg"
                  stroke={rawColors.app.blue}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  // One defined point cannot be stroked (recharts emits `M x,y Z`),
                  // so mark it instead of drawing nothing at all. This keys off the
                  // AVERAGE point count, not `data.length` -- the leading months
                  // carry no average, so a 3-month window is exactly this case.
                  dot={rollingAvgPointCount === 1 ? { r: 4, fill: rawColors.app.blue } : false}
                  activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
                  name={`Income (${rollingAvgMonths}m avg)`}
                  isAnimationActive={animate}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
              </ComposedChart>
            </ChartContainer>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-relaxed text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="w-5 border-t border-dotted" style={{ borderColor: rawColors.text.secondary }} aria-hidden="true" />
                Reference lines
              </span>
              {peakIncome !== undefined && (
                <span>Peak: <span className="font-mono tabular-nums text-foreground">{formatCurrency(peakIncome)}</span></span>
              )}
              {avgIncome > 0 && (
                <span>Average: <span className="font-mono tabular-nums text-foreground">{formatCurrency(avgIncome)}</span></span>
              )}
            </p>
            {chartDataTable(
              data,
              [
                { header: 'Month', rowHeader: true, value: (row) => formatMonthKey(row.month, { month: 'long', year: 'numeric' }) },
                { header: 'Income', value: (row) => formatCurrency(row.income) },
                { header: `${rollingAvgMonths}-month average`, value: (row) => row.incomeAvg === undefined ? 'Not available' : formatCurrency(row.incomeAvg) },
              ],
              'Monthly income and rolling average',
              (row) => row.month,
            )}
          </>
        ) : (
          <EmptyState
            icon={TrendingUp}
            title="No income data available"
            description="Start by uploading your transaction data to see income trends."
            actionLabel="Upload Data"
            actionHref="/upload"
            variant="chart"
          />
        )}
      </div>
    </motion.section>
  )
}

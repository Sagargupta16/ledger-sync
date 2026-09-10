import { motion } from 'motion/react'
import { TrendingDown } from 'lucide-react'
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { CHART_LINE_CURSOR_STYLE } from '@/components/ui/ChartTooltip'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import {
  ACTIVE_DOT,
  areaGradient,
  areaGradientUrl,
  ChartContainer,
  chartTooltipProps,
  currencyTooltipFormatter,
  GRID_DEFAULTS,
  referenceLine,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { rawColors } from '@/constants/colors'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { rollingAvgCaption } from '@/lib/chartUtils'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/formatters'

interface MonthlyTrendDatum {
  month: string
  label: string
  expense: number
  /** Undefined until a full rolling window exists -- see `useSpendingAnalysis`. */
  expenseAvg?: number
}

interface ExpenseTrendSectionProps {
  readonly monthlyTrendData: MonthlyTrendDatum[]
  readonly peakExpense: number
  readonly monthlyAvgSpending: number
  /**
   * On-chart text for the Avg reference line, which must name the divisor the
   * mean was taken over. A bare "Avg: <amount>" over a calendar-month mean can
   * sit below every bar on a sparse window while calling itself their average;
   * see `monthlyAvgLineLabelFor`.
   */
  readonly monthlyAvgLineLabel: string
  /** Count of months that have a real rolling average (not the data length). */
  readonly rollingAvgPointCount: number
  readonly rollingAvgMonths: number
}

export default function ExpenseTrendSection({
  monthlyTrendData,
  peakExpense,
  monthlyAvgSpending,
  monthlyAvgLineLabel,
  rollingAvgPointCount,
  rollingAvgMonths,
}: ExpenseTrendSectionProps) {
  const dimensions = useChartDimensions()
  const { animate } = useChartPresentation(monthlyTrendData.length)

  return (
    <motion.section
      className="ledger-panel min-w-0 p-4 sm:p-6"
      {...SCROLL_FADE_UP}
      aria-labelledby="expense-trend-title"
    >
      <div className="space-y-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 max-w-xl">
            <div className="mb-2 flex items-center gap-2 text-app-red">
              <TrendingDown className="size-4 shrink-0" aria-hidden="true" />
              <p className="ledger-meta">Spending over time</p>
            </div>
            <h2 id="expense-trend-title" className="text-xl font-semibold tracking-tight text-foreground">
              Expense Trend
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Monthly spending with a {rollingAvgMonths}-month rolling average.{' '}
              {rollingAvgCaption(rollingAvgPointCount, rollingAvgMonths)}
            </p>
          </div>
          {monthlyTrendData.length > 0 && (
            <dl className="shrink-0 border-t border-border pt-3 sm:border-0 sm:pt-0 sm:text-right">
              <dt className="text-xs text-muted-foreground">Peak monthly spending</dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-app-red">
                {formatCurrency(peakExpense)}
              </dd>
            </dl>
          )}
        </div>

        {monthlyTrendData.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-border/60 py-3">
              <ul aria-label="Expense chart series" className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-0.5 w-5 rounded-full bg-app-red" aria-hidden="true" />{' '}
                  Monthly spending
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 border-t-2 border-dashed" style={{ borderColor: rawColors.app.blue }} aria-hidden="true" />
                  {rollingAvgMonths}-month average
                </li>
              </ul>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {monthlyTrendData[0].label} to {monthlyTrendData.at(-1)?.label}
              </p>
            </div>
            <ChartContainer
              height={360}
              mobileHeight={260}
              ariaLabel={`Monthly spending over time with a ${rollingAvgMonths}-month rolling average, plus peak and average reference lines`}
            >
              <ComposedChart
                data={monthlyTrendData}
                margin={{ top: 16, right: 12, bottom: 8, left: 0 }}
              >
                <defs>{areaGradient('expenseTrend', rawColors.app.red, 0.24, 0.01)}</defs>
                <CartesianGrid {...GRID_DEFAULTS} />
                <XAxis
                  {...xAxisDefaults(monthlyTrendData.length)}
                  dataKey="label"
                  interval={dimensions.breakpoint === 'mobile' ? 'preserveStartEnd' : xAxisDefaults(monthlyTrendData.length).interval}
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
                    return month
                      ? formatMonthKey(month, { month: 'long', year: 'numeric' })
                      : ''
                  }}
                  formatter={(value, name) => [
                    currencyTooltipFormatter(value),
                    name === `Spending (${rollingAvgMonths}m avg)` ? `Spending (${rollingAvgMonths}m avg)` : 'Spending',
                  ]}
                  itemSorter={(item) => -(item.value as number)}
                />
                {referenceLine({
                  y: peakExpense,
                  variant: 'peak',
                })}
                {referenceLine({
                  y: monthlyAvgSpending,
                  variant: 'avg',
                })}
                <Area
                  type="monotone"
                  dataKey="expense"
                  name="Spending"
                  stroke={rawColors.app.red}
                  fill={areaGradientUrl('expenseTrend')}
                  strokeWidth={2.5}
                  dot={monthlyTrendData.length === 1 ? { r: 4, fill: rawColors.app.red } : false}
                  activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.red }}
                  isAnimationActive={animate}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="expenseAvg"
                  stroke={rawColors.app.blue}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  // One defined point cannot be stroked (recharts emits `M x,y Z`),
                  // so mark it instead of drawing nothing at all.
                  dot={rollingAvgPointCount === 1 ? { r: 4, fill: rawColors.app.blue } : false}
                  activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
                  name={`Spending (${rollingAvgMonths}m avg)`}
                  isAnimationActive={animate}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
              </ComposedChart>
            </ChartContainer>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-2 w-5 shrink-0 border-t border-dotted" style={{ borderColor: rawColors.text.secondary }} aria-hidden="true" />
              Reference lines: peak monthly spending and {monthlyAvgLineLabel}
            </p>
            {chartDataTable(
              monthlyTrendData,
              [
                { header: 'Month', rowHeader: true, value: (row) => formatMonthKey(row.month, { month: 'long', year: 'numeric' }) },
                { header: 'Spending', value: (row) => formatCurrency(row.expense) },
                { header: `${rollingAvgMonths}-month average`, value: (row) => row.expenseAvg === undefined ? 'Not available' : formatCurrency(row.expenseAvg) },
              ],
              'Monthly spending and rolling average',
              (row) => row.month,
            )}
          </>
        ) : (
          <ChartEmptyState
            height={dimensions.chartHeight}
            message="No spending in this range. Try a wider date range or upload more statements."
          />
        )}
      </div>
    </motion.section>
  )
}

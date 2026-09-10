import { motion } from 'motion/react'
import { LineChart as LineChartIcon } from 'lucide-react'
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import EmptyState from '@/components/shared/EmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { CHART_LINE_CURSOR_STYLE } from '@/components/ui/ChartTooltip'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import {
  ACTIVE_DOT,
  areaGradient,
  areaGradientUrl,
  chartTooltipProps,
  ChartContainer,
  GRID_DEFAULTS,
  referenceLine,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/formatters'

import { formatTooltipName } from '../trendsUtils'
import type { useTrendsForecasts } from '../useTrendsForecasts'

const MAX_VISIBLE_LABELS = {
  mobile: 4,
  tablet: 8,
  desktop: 8,
} as const

type MonthlyTrendData = ReturnType<typeof useTrendsForecasts>['monthlyTrendWithAvg']

interface MonthlyTrendSectionProps {
  readonly isLoading: boolean
  readonly data: MonthlyTrendData
  readonly peakIncome: number
  readonly peakExpenses: number
  readonly peakSavings: number
  /** Count of months that have a real rolling average (not the data length). */
  readonly rollingAvgPointCount: number
  readonly rollingAvgMonths: number
  readonly activeLabel: string | null
  readonly onActiveLabelChange: (label: string | null) => void
}

export default function MonthlyTrendSection({
  isLoading,
  data,
  peakIncome,
  peakExpenses,
  peakSavings,
  rollingAvgPointCount,
  rollingAvgMonths,
  activeLabel,
  onActiveLabelChange,
}: MonthlyTrendSectionProps) {
  const dims = useChartDimensions()
  const series = [
    {
      id: 'trendIncome',
      color: rawColors.app.green,
      label: 'Income',
      dataKey: 'income',
      avgKey: 'incomeAvg',
      peak: peakIncome,
    },
    {
      id: 'trendExpense',
      color: rawColors.app.red,
      label: 'Expenses',
      dataKey: 'expenses',
      avgKey: 'expensesAvg',
      peak: peakExpenses,
    },
    {
      id: 'trendSavings',
      color: rawColors.app.blue,
      label: 'Savings',
      dataKey: 'savings',
      avgKey: 'savingsAvg',
      peak: peakSavings,
    },
  ] as const
  const { animate: animateCharts } = useChartPresentation(data.length * series.length * 2)
  const maxVisibleLabels = MAX_VISIBLE_LABELS[dims.breakpoint]
  const xAxisInterval = Math.max(0, Math.ceil(data.length / maxVisibleLabels) - 1)

  return (
    <motion.section
      {...SCROLL_FADE_UP}
      className="ledger-panel min-w-0 p-4 sm:p-6"
      aria-labelledby="income-expense-trends-title"
    >
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-app-blue">
            <LineChartIcon className="size-4 shrink-0" aria-hidden="true" />
            <p className="ledger-meta">Your monthly trajectory</p>
          </div>
          <h2
            id="income-expense-trends-title"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            Income & Expense Trends
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Monthly breakdown with {rollingAvgMonths}-month rolling averages
          </p>
        </div>
        {data.length > 0 && (
          <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {data[0].label} to {data.at(-1)?.label}
          </p>
        )}
      </div>

      {isLoading && <ChartSkeleton height="h-80" />}
      {!isLoading && data.length > 0 && (
        <div className="divide-y divide-border">
          {series.map(({ id, color, label, dataKey, avgKey, peak }) => (
            <div
              key={id}
              className="grid min-w-0 grid-cols-1 gap-4 py-6 first:border-t first:border-border last:pb-0 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-6"
            >
              <div className="flex flex-wrap justify-between gap-3 lg:block">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span
                      className="h-2 w-2 rounded-sm"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    {label}
                  </h3>
                  <dl className="mt-3">
                    <dt className="text-xs text-muted-foreground">Peak month</dt>
                    <dd className="mt-1 break-words font-mono text-lg font-semibold tabular-nums" style={{ color }}>
                      {formatCurrency(peak)}
                    </dd>
                  </dl>
                </div>
                <ul className="space-y-2 text-xs text-muted-foreground lg:mt-5" aria-label={`${label} chart series`}>
                  <li className="flex items-center gap-2">
                    <span className="h-0.5 w-5" style={{ backgroundColor: color }} aria-hidden="true" />{' '}
                    Monthly total
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-5 border-t-2 border-dashed" style={{ borderColor: rawColors.text.secondary }} aria-hidden="true" />
                    {rollingAvgMonths}-month average
                  </li>
                </ul>
              </div>
              <div className="min-w-0">
                <ChartContainer
                  height={220}
                  mobileHeight={230}
                  ariaLabel={`Monthly ${label.toLowerCase()} with ${rollingAvgMonths}-month rolling average and peak reference line`}
                >
                  <ComposedChart
                    data={data}
                    margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
                    syncId="monthly-finance-trends"
                    syncMethod="value"
                    onMouseMove={(event) => {
                      if (event?.activeLabel) onActiveLabelChange(String(event.activeLabel))
                    }}
                    onMouseLeave={() => onActiveLabelChange(null)}
                  >
                    <defs>{areaGradient(id, color, 0.24, 0.01)}</defs>
                    <CartesianGrid {...GRID_DEFAULTS} />
                    <XAxis
                      {...xAxisDefaults(data.length)}
                      dataKey="label"
                      interval={xAxisInterval}
                    />
                    <YAxis
                      {...yAxisDefaults({ width: dims.breakpoint === 'mobile' ? 56 : 64 })}
                      domain={dataKey === 'savings' ? ['auto', 'auto'] : [0, 'auto']}
                    />
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
                        typeof value === 'number' ? formatCurrency(value) : '',
                        formatTooltipName(
                          name === undefined ? undefined : String(name),
                          rollingAvgMonths,
                        ),
                      ]}
                    />
                    {referenceLine({
                      y: peak,
                      variant: 'peak',
                    })}
                    {dataKey === 'savings' && referenceLine({ y: 0, variant: 'zero' })}
                    {activeLabel && (
                      <ReferenceLine
                        x={activeLabel}
                        stroke={rawColors.chart.activeStroke}
                        strokeDasharray="3 3"
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey={dataKey}
                      stroke={color}
                      fill={areaGradientUrl(id)}
                      strokeWidth={2.5}
                      dot={data.length === 1 ? { r: 3, fill: color } : false}
                      activeDot={{ ...ACTIVE_DOT, fill: color }}
                      isAnimationActive={animateCharts}
                      animationDuration={700}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey={avgKey}
                      stroke={rawColors.text.secondary}
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      // Keys off the AVERAGE point count, not `data.length`: the
                      // leading months carry no average, so three complete months
                      // (the default FY view) leave a single point, and recharts
                      // strokes nothing for one point (`M x,y Z`).
                      dot={rollingAvgPointCount === 1 ? { r: 4, fill: rawColors.text.secondary } : false}
                      activeDot={{ ...ACTIVE_DOT, fill: rawColors.text.secondary }}
                      name={`${label} (${rollingAvgMonths}m avg)`}
                      isAnimationActive={animateCharts}
                      animationDuration={700}
                      animationEasing="ease-out"
                    />
                  </ComposedChart>
                </ChartContainer>
                {chartDataTable(
                  data,
                  [
                    { header: 'Month', rowHeader: true, value: (row) => formatMonthKey(row.month, { month: 'long', year: 'numeric' }) },
                    { header: label, value: (row) => formatCurrency(row[dataKey]) },
                    { header: `${rollingAvgMonths}-month average`, value: (row) => row[avgKey] === undefined ? 'Not available' : formatCurrency(row[avgKey]) },
                  ],
                  `Monthly ${label.toLowerCase()} and rolling average`,
                  (row) => row.month,
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {!isLoading && data.length > 0 && (
        <p className="mt-5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          Each plot uses its own amount scale. Dotted horizontal lines mark peak months; the savings plot also marks break-even.
        </p>
      )}
      {!isLoading && data.length === 0 && (
        <EmptyState
          icon={LineChartIcon}
          title="No data available"
          description="Upload your transaction data to see spending trends and forecasts."
          actionLabel="Upload Data"
          actionHref="/upload"
          variant="chart"
        />
      )}
    </motion.section>
  )
}

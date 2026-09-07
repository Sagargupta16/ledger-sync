import { LineChart as LineChartIcon } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import EmptyState from '@/components/shared/EmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  ACTIVE_DOT,
  areaGradient,
  areaGradientUrl,
  chartTooltipProps,
  ChartContainer,
  GRID_DEFAULTS,
  referenceLine,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

import { formatTooltipName } from '../trendsUtils'
import type { useTrendsForecasts } from '../useTrendsForecasts'

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
      color: rawColors.app.purple,
      label: 'Savings',
      dataKey: 'savings',
      avgKey: 'savingsAvg',
      peak: peakSavings,
    },
  ] as const
  const animateCharts = shouldAnimate(data.length * series.length * 2)
  const maxVisibleLabels =
    dims.breakpoint === 'mobile' ? 4 : dims.breakpoint === 'tablet' ? 8 : 6
  const xAxisInterval = Math.max(0, Math.ceil(data.length / maxVisibleLabels) - 1)

  return (
    <section className="ledger-panel p-4 sm:p-5" aria-labelledby="income-expense-trends-title">
      <div className="mb-4 flex items-start gap-2.5">
        <LineChartIcon className="mt-0.5 size-5 shrink-0 text-app-blue" aria-hidden="true" />
        <div>
          <h2
            id="income-expense-trends-title"
            className="text-base font-semibold text-foreground"
          >
            Income & Expense Trends
          </h2>
          <p className="text-sm text-text-tertiary">
            Monthly breakdown with {rollingAvgMonths}-month rolling averages
          </p>
        </div>
      </div>

      {isLoading && <ChartSkeleton height="h-80" />}
      {!isLoading && data.length > 0 && (
        <div className="grid grid-cols-1 divide-y divide-[var(--hairline-1)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {series.map(({ id, color, label, dataKey, avgKey, peak }) => (
            <div
              key={id}
              className="min-w-0 py-4 first:pt-0 last:pb-0 lg:px-4 lg:py-0 lg:first:pl-0 lg:last:pr-0"
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-foreground">{label}</span>
              </div>
              <ChartContainer
                height={180}
                ariaLabel={`Monthly ${label.toLowerCase()} with ${rollingAvgMonths}-month rolling average and peak reference line`}
              >
                <AreaChart
                  data={data}
                  onMouseMove={(event) => {
                    if (event?.activeLabel) onActiveLabelChange(String(event.activeLabel))
                  }}
                  onMouseLeave={() => onActiveLabelChange(null)}
                >
                  <defs>{areaGradient(id, color, 0.4, 0.02)}</defs>
                  <CartesianGrid {...GRID_DEFAULTS} />
                  <XAxis
                    {...xAxisDefaults(data.length)}
                    dataKey="label"
                    interval={xAxisInterval}
                  />
                  <YAxis {...yAxisDefaults({ width: 46 })} />
                  <Tooltip
                    {...chartTooltipProps}
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
                    label: `Peak: ${formatCurrencyShort(peak)}`,
                    variant: 'peak',
                  })}
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
                    strokeWidth={2}
                    dot={data.length === 1 ? { r: 3, fill: color } : false}
                    activeDot={{ ...ACTIVE_DOT, fill: color }}
                    isAnimationActive={animateCharts}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey={avgKey}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    // Keys off the AVERAGE point count, not `data.length`: the
                    // leading months carry no average, so three complete months
                    // (the default FY view) leave a single point, and recharts
                    // strokes nothing for one point (`M x,y Z`).
                    dot={rollingAvgPointCount === 1 ? { r: 3, fill: color } : false}
                    activeDot={{ ...ACTIVE_DOT, fill: color }}
                    name={`${label} (${rollingAvgMonths}m avg)`}
                    isAnimationActive={animateCharts}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          ))}
        </div>
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
    </section>
  )
}

import { motion } from 'framer-motion'
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
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
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
  readonly activeLabel: string | null
  readonly onActiveLabelChange: (label: string | null) => void
}

export default function MonthlyTrendSection({
  isLoading,
  data,
  peakIncome,
  peakExpenses,
  peakSavings,
  activeLabel,
  onActiveLabelChange,
}: MonthlyTrendSectionProps) {
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

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="mb-6 flex items-center gap-3">
        <LineChartIcon className="h-5 w-5 text-app-blue" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Income & Expense Trends</h2>
          <p className="text-sm text-text-tertiary">
            Monthly breakdown with 3-month rolling averages
          </p>
        </div>
      </div>

      {isLoading && <ChartSkeleton height="h-80" />}
      {!isLoading && data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {series.map(({ id, color, label, dataKey, avgKey, peak }) => (
            <div key={id} className="glass-thin rounded-xl border border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm font-medium text-foreground">{label}</span>
              </div>
              <ChartContainer
                height={180}
                ariaLabel={`Monthly ${label.toLowerCase()} with 3-month rolling average and peak reference line`}
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
                  <XAxis {...xAxisDefaults(data.length)} dataKey="label" />
                  <YAxis hide />
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
                      formatTooltipName(name === undefined ? undefined : String(name)),
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
                    isAnimationActive={shouldAnimate(data.length)}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey={avgKey}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={data.length === 1 ? { r: 3, fill: color } : false}
                    activeDot={{ ...ACTIVE_DOT, fill: color }}
                    name={`${label} (3m avg)`}
                    isAnimationActive={shouldAnimate(data.length)}
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
    </motion.section>
  )
}

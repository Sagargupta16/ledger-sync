import { motion } from 'motion/react'
import { TrendingDown } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import {
  areaGradient,
  areaGradientUrl,
  ChartContainer,
  chartTooltipProps,
  currencyTooltipFormatter,
  GRID_DEFAULTS,
  referenceLine,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { rawColors } from '@/constants/colors'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { rollingAvgCaption } from '@/lib/chartUtils'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrencyShort } from '@/lib/formatters'

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

  return (
    <motion.section
      className="glass rounded-xl border border-border p-4 md:p-6"
      {...SCROLL_FADE_UP}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <TrendingDown className="h-5 w-5 shrink-0 text-app-red" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Expense Trend</h2>
            <p className="text-sm text-text-tertiary">
              Monthly spending with a {rollingAvgMonths}-month rolling average.{' '}
              {rollingAvgCaption(rollingAvgPointCount, rollingAvgMonths)}
            </p>
          </div>
        </div>

        {monthlyTrendData.length > 0 ? (
          <ChartContainer
            height={dimensions.chartHeight}
            ariaLabel={`Monthly spending over time with a ${rollingAvgMonths}-month rolling average, plus peak and average reference lines`}
          >
            <AreaChart data={monthlyTrendData} margin={dimensions.margin}>
              <defs>{areaGradient('expenseTrend', rawColors.app.red, 0.4, 0)}</defs>
              <CartesianGrid {...GRID_DEFAULTS} />
              <XAxis {...xAxisDefaults(monthlyTrendData.length)} dataKey="label" />
              <YAxis {...yAxisDefaults()} />
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
                  currencyTooltipFormatter(value),
                  name === 'expenseAvg' ? `Spending (${rollingAvgMonths}m avg)` : 'Spending',
                ]}
                itemSorter={(item) => -(item.value as number)}
              />
              {referenceLine({
                y: peakExpense,
                label: `Peak: ${formatCurrencyShort(peakExpense)}`,
                variant: 'peak',
              })}
              {referenceLine({
                y: monthlyAvgSpending,
                label: monthlyAvgLineLabel,
                variant: 'avg',
              })}
              <Area
                type="monotone"
                dataKey="expense"
                stroke={rawColors.app.red}
                fill={areaGradientUrl('expenseTrend')}
                strokeWidth={2}
                dot={false}
                isAnimationActive={shouldAnimate(monthlyTrendData.length)}
                animationDuration={600}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="expenseAvg"
                stroke={rawColors.app.red}
                strokeWidth={2}
                strokeDasharray="6 3"
                // One defined point cannot be stroked (recharts emits `M x,y Z`),
                // so mark it instead of drawing nothing at all.
                dot={rollingAvgPointCount === 1 ? { r: 3, fill: rawColors.app.red } : false}
                name={`Spending (${rollingAvgMonths}m avg)`}
                isAnimationActive={shouldAnimate(monthlyTrendData.length)}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ChartContainer>
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

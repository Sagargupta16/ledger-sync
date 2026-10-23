import { motion } from 'motion/react'
import { TrendingDown } from 'lucide-react'

import AreaSeries from '@/components/charts/AreaSeries'
import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart from '@/components/charts/CartesianChart'
import type { TooltipSeries } from '@/components/charts/CartesianTooltip'
import ChartBrush from '@/components/charts/ChartBrush'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import { ReferenceLine } from '@/components/charts/References'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { chartDataTable } from '@/components/ui/chartDataTable'
import ChartRangeControls from '@/components/ui/ChartRangeControls'
import { useChartRange } from '@/components/ui/useChartRange'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatChartPeriod } from '@/lib/chartDateLabels'
import { rollingAvgCaption } from '@/lib/chartUtils'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/formatters'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { colors } from '@/constants/colors'
import ValueSortedTooltip from '@/pages/income-analysis/components/ValueSortedTooltip'

/** Every plotted key, so the value axis spans the total and its average. */
const SERIES = [{ key: 'expense' }, { key: 'expenseAvg' }] as const
/** The monthly total keeps the expense colour; the average is neutral, as on /forecasts. */
const TOTAL_COLOR = colors.app.red
const AVERAGE_COLOR = colors.text.secondary

const monthHeading = (month: string) => formatMonthKey(month, { month: 'long', year: 'numeric' })

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
  const range = useChartRange(monthlyTrendData.map((row) => row.month))
  const tooltipSeries: TooltipSeries[] = [
    { key: 'expense', label: 'Spending', color: TOTAL_COLOR },
    { key: 'expenseAvg', label: `Spending (${rollingAvgMonths}m avg)`, color: AVERAGE_COLOR },
  ]

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
                  <span className="w-5 border-t-2 border-dashed border-text-secondary" aria-hidden="true" />
                  {rollingAvgMonths}-month average
                </li>
              </ul>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatChartPeriod(monthlyTrendData[0].month)} to {formatChartPeriod(monthlyTrendData.at(-1)!.month)}
              </p>
            </div>
            {monthlyTrendData.length > 6 && <ChartRangeControls range={range} label="Spending chart range" />}
            <CartesianChart
              data={monthlyTrendData}
              categoryKey="month"
              series={SERIES}
              categoryKind="point"
              // Both references join the value domain, so a zoom never pushes their lines off the plot.
              extraValues={[peakExpense, monthlyAvgSpending]}
              visibleRange={range}
              height={360}
              mobileHeight={260}
              ariaLabel={`Monthly spending over time with a ${rollingAvgMonths}-month rolling average, plus peak and average reference lines`}
              tooltip={<ValueSortedTooltip series={tooltipSeries} formatLabel={monthHeading} />}
            >
              <Grid />
              <Crosshair />
              <ValueAxis />
              <CategoryAxis interval="preserveStartEnd" />
              {/* The total draws in as its fill wipes behind it; the average wipes in just after. */}
              <AreaSeries dataKey="expense" color={TOTAL_COLOR} strokeWidth={2.5} fillOpacity={0.24} />
              {/* showDots 'auto' marks a lone average point, which a stroke cannot show. */}
              <LineSeries dataKey="expenseAvg" color={AVERAGE_COLOR} strokeWidth={2} dash="6 3" seriesIndex={1} />
              <ReferenceLine value={peakExpense} variant="peak" />
              <ReferenceLine value={monthlyAvgSpending} variant="avg" />
            </CartesianChart>
            {monthlyTrendData.length > 6 && (
              <ChartBrush range={range} values={monthlyTrendData.map((row) => row.expense)} ariaLabel="Spending chart zoom" />
            )}
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-2 w-5 shrink-0 border-t border-dotted border-text-secondary" aria-hidden="true" />
              Reference lines: peak monthly spending and {monthlyAvgLineLabel}
            </p>
            {chartDataTable(
              monthlyTrendData,
              [
                { header: 'Month', rowHeader: true, value: (row) => monthHeading(row.month) },
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

import { motion } from 'motion/react'
import { TrendingUp } from 'lucide-react'

import AreaSeries from '@/components/charts/AreaSeries'
import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart from '@/components/charts/CartesianChart'
import type { TooltipSeries } from '@/components/charts/CartesianTooltip'
import ChartBrush from '@/components/charts/ChartBrush'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import { ReferenceLine } from '@/components/charts/References'
import EmptyState from '@/components/shared/EmptyState'
import { chartDataTable } from '@/components/ui/chartDataTable'
import ChartRangeControls from '@/components/ui/ChartRangeControls'
import { useChartRange } from '@/components/ui/useChartRange'
import { formatChartPeriod } from '@/lib/chartDateLabels'
import { rollingAvgCaption } from '@/lib/chartUtils'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/formatters'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { colors } from '@/constants/colors'

import type { MonthlyIncomeDatum } from '../useIncomeAnalysis'
import ValueSortedTooltip from './ValueSortedTooltip'

/** Every plotted key, so the value axis spans the total and its average. */
const SERIES = [{ key: 'income' }, { key: 'incomeAvg' }] as const
/** The monthly total keeps the income colour; the average is neutral, as on /forecasts. */
const TOTAL_COLOR = colors.app.green
const AVERAGE_COLOR = colors.text.secondary

const monthHeading = (month: string) => formatMonthKey(month, { month: 'long', year: 'numeric' })

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
  const range = useChartRange(data.map((row) => row.month))
  const tooltipSeries: TooltipSeries[] = [
    { key: 'income', label: 'Income', color: TOTAL_COLOR },
    { key: 'incomeAvg', label: `Income (${rollingAvgMonths}m avg)`, color: AVERAGE_COLOR },
  ]
  // Drawn reference values join the value domain, so a zoom never pushes their lines off the plot.
  const referenceValues = [peakIncome, avgIncome > 0 ? avgIncome : undefined].filter((value) => value !== undefined)

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
                  <span className="h-0.5 w-5 rounded-full bg-app-green" aria-hidden="true" />{' '}
                  Monthly income
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 border-t-2 border-dashed border-text-secondary" aria-hidden="true" />
                  {rollingAvgMonths}-month average
                </li>
              </ul>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatChartPeriod(data[0].month)} to {formatChartPeriod(data.at(-1)!.month)}
              </p>
            </div>
            {data.length > 6 && <ChartRangeControls range={range} label="Income chart range" />}
            <CartesianChart
              data={data}
              categoryKey="month"
              series={SERIES}
              categoryKind="point"
              extraValues={referenceValues}
              visibleRange={range}
              height={360}
              mobileHeight={260}
              ariaLabel={`Monthly income over time with a ${rollingAvgMonths}-month rolling average, plus peak and average reference lines`}
              tooltip={<ValueSortedTooltip series={tooltipSeries} formatLabel={monthHeading} />}
            >
              <Grid />
              <Crosshair />
              <ValueAxis />
              <CategoryAxis interval="preserveStartEnd" />
              {/* The total draws in as its fill wipes behind it; the average wipes in just after. */}
              <AreaSeries dataKey="income" color={TOTAL_COLOR} strokeWidth={2.5} fillOpacity={0.24} />
              {/* showDots 'auto' marks a lone average point (the leading months carry
                  none, so a 3-month window leaves one), which a stroke cannot show. */}
              <LineSeries dataKey="incomeAvg" color={AVERAGE_COLOR} strokeWidth={2} dash="6 3" seriesIndex={1} />
              {peakIncome !== undefined && <ReferenceLine value={peakIncome} variant="peak" />}
              {avgIncome > 0 && <ReferenceLine value={avgIncome} variant="avg" />}
            </CartesianChart>
            {data.length > 6 && (
              <ChartBrush range={range} values={data.map((row) => row.income)} ariaLabel="Income chart zoom" />
            )}
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-relaxed text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="w-5 border-t border-dotted border-text-secondary" aria-hidden="true" />{' '}
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
                { header: 'Month', rowHeader: true, value: (row) => monthHeading(row.month) },
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

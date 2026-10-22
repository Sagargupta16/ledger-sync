import { useMemo } from 'react'
import { motion } from 'motion/react'

import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import Bars from '@/components/charts/Bars'
import CartesianChart from '@/components/charts/CartesianChart'
import CartesianTooltip, { type TooltipSeries } from '@/components/charts/CartesianTooltip'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { chartDataTable } from '@/components/ui/chartDataTable'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import type { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { colors } from '@/constants/colors'
import { SCROLL_FADE_UP } from '@/constants/animations'
import type { useYearInReview } from '../useYearInReview'

type MonthlyBarData = ReturnType<typeof useYearInReview>['monthlyBarData']
type ChartDimensions = ReturnType<typeof useChartDimensions>

interface MonthlyBreakdownChartProps {
  readonly monthlyBarData: MonthlyBarData
  readonly dims: ChartDimensions
}

/**
 * One list for the plotted series, the tooltip rows and the legend, so all
 * three read Income, Spending, Net. Income is also the first bar of each pair.
 */
const FLOWS: readonly TooltipSeries[] = [
  { key: 'Earning', label: 'Income', color: colors.app.green },
  { key: 'Spending', label: 'Spending', color: colors.app.red },
  { key: 'Net', label: 'Net cash flow', color: colors.app.blue },
]
const BAR_SIZE = 28
const BAR_OPACITY = 0.9

export default function MonthlyBreakdownChart({ monthlyBarData, dims }: MonthlyBreakdownChartProps) {
  const isPhone = dims.breakpoint === 'mobile'
  // Angle the month labels only when the density check says so (mobile/tablet)
  // and there are enough months to collide -- keeps the desktop chart's flat
  // labels untouched. Rotated labels hang lower, so the bottom margin grows.
  const angled = dims.angleXLabels && monthlyBarData.length > 6
  const showBarLabels = dims.showBarLabels && monthlyBarData.length <= 6
  const barLabel = showBarLabels ? formatCurrencyShort : undefined
  const margin = useMemo(
    () => ({ top: 20, right: 12, bottom: angled ? 44 : 28, left: isPhone ? 56 : 64 }),
    [angled, isPhone],
  )

  return (
    <motion.div
      {...SCROLL_FADE_UP}
      className="ledger-panel min-w-0 p-4 sm:p-6"
    >
      <p className="ledger-meta mb-2 text-app-blue">The year, month by month</p>
      <h2 className="text-xl font-semibold tracking-tight">Monthly Breakdown</h2>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">Income, spending, and net cash flow each month</p>
      <div className="border-y border-border/60 py-3 [&>div]:mb-0">
        <ChartSeriesLegend items={FLOWS} caption="Bars: in / out · Line: net" />
      </div>
      <div className="mt-5 min-w-0">
        {monthlyBarData.every((d) => d.Spending === 0 && d.Earning === 0) ? (
          <ChartEmptyState height={isPhone ? 280 : 340} />
        ) : (
          <>
            <CartesianChart
              data={monthlyBarData}
              categoryKey="name"
              series={FLOWS}
              categoryKind="band"
              height={340}
              mobileHeight={280}
              margin={margin}
              ariaLabel="Monthly breakdown -- income and spending bars with a net cash flow line per month, against a break-even baseline"
              tooltip={<CartesianTooltip series={FLOWS} />}
            >
              <Grid />
              {/* Draws the break-even line at 0 whenever a month runs a deficit, so
                the Net line's sign crossing (saving above, overspending below)
                reads at a glance against the income/spend bars. */}
              <ValueAxis />
              <CategoryAxis angle={angled ? -45 : 0} />
              {/* Each month's pair grows together, month by month. */}
              <Bars dataKey="Earning" color={colors.app.green} groupIndex={0} groupCount={2}
                barSize={BAR_SIZE} fillOpacity={BAR_OPACITY} label={barLabel} />
              <Bars dataKey="Spending" color={colors.app.red} groupIndex={1} groupCount={2}
                barSize={BAR_SIZE} fillOpacity={BAR_OPACITY} label={barLabel} />
              {/* Net cash flow line so savings months pop visually -- a peak above
                the bars means a saving month, a trough between them means an
                overspending month. It draws in over the bars, dots popping. */}
              <LineSeries dataKey="Net" color={colors.app.blue} strokeWidth={2.5} showDots seriesIndex={2} />
            </CartesianChart>
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

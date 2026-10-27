import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { motion } from 'motion/react'

import EmptyState from '@/components/shared/EmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import ChartRangeControls from '@/components/ui/ChartRangeControls'
import ChartSection from '@/components/ui/ChartSection'
import { useChartRange } from '@/components/ui/useChartRange'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { getTodayKey } from '@/lib/dateUtils'
import { formatCurrency, formatDate, formatPercent } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

import { NO_SAVINGS_GROWTH, PROJECTION_HORIZON_MONTHS, type SavingsGrowth } from '../netWorthCompound'
import { CATEGORY_CONFIG } from '../netWorthUtils'
import { NetWorthAreaPlot } from './NetWorthAreaPlot'
import { NetWorthChartSummary } from './NetWorthChartSummary'
import { getNetWorthChartView, type NetWorthTrendChartProps } from './netWorthChartView'
import { toNetWorthPlotRows, type NetWorthPlotRow } from './netWorthPlotRows'
import { NetWorthViewToggles } from './NetWorthViewToggles'

const bandRange = (row: NetWorthPlotRow) =>
  typeof row.projectionLow === 'number' && typeof row.projectionHigh === 'number'
    ? `${formatCurrency(row.projectionLow)} to ${formatCurrency(row.projectionHigh)}`
    : 'Not applicable'

const amountOrNa = (value: unknown) => (typeof value === 'number' ? formatCurrency(value) : 'Not applicable')

/** How the projection was built, and why it is a straight line when it is one. */
function projectionNote(monthlyGrowth: number, growth: SavingsGrowth): string {
  const saving = `${formatCurrency(monthlyGrowth)}/month`
  const tail = 'The shaded range is ±1σ; market returns are not included. Estimates, not advice.'
  if (growth.rate === 0) {
    const reason = growth.years < 2
      ? 'Compounding needs 24 complete months in this range to measure how your savings grow'
      : `Your yearly savings were not positive at both ends of the last ${growth.years} years, so their growth cannot be measured`
    return `Straight-line projection at ${saving} in average savings. ${reason}. ${tail}`
  }
  const pace = formatPercent(Math.abs(growth.rate) * 100)
  const capped = growth.measured !== null && growth.measured !== growth.rate
    ? ` (measured ${formatPercent(growth.measured * 100)}, held to ${formatPercent(growth.rate * 100)})`
    : ''
  const years = PROJECTION_HORIZON_MONTHS / 12
  return `Compound projection: your average saving of ${saving} ${growth.rate > 0 ? 'grows' : 'shrinks'} ${pace} a year for the ${years} years shown, the CAGR of your yearly savings over the last ${growth.years} years${capped}. Milestone dates past them keep the saving at its year-${years} level. The grey dashed line is the previous straight line, the same saving every month, kept for comparison. ${tail}`
}

export function NetWorthTrendChart(props: Readonly<NetWorthTrendChartProps>) {
  const {
    isLoading,
    filteredNetWorthData,
    chartData,
    allCategories,
    setShowStacked,
    showProjection,
    setShowProjection,
    monthlyGrowth,
    savingsGrowth = NO_SAVINGS_GROWTH,
    anchor,
    milestoneRows,
  } = props
  const motionEnabled = useMotionStore((state) => state.mode === 'full')
  const { stackedAllowed, effectiveStacked, plotData } = getNetWorthChartView(props)
  // One row per date before anything indexes it: the zoom, the plot and the table.
  const rows = useMemo(() => toNetWorthPlotRows(plotData), [plotData])
  const range = useChartRange(rows.map((row) => String(row.date)))
  const firstPoint = filteredNetWorthData[0]
  const lastPoint = filteredNetWorthData.at(-1)
  const showProjectionLine = showProjection && monthlyGrowth > 0 && !effectiveStacked
  // The straight line only differs from the compound one when the saving grows or shrinks.
  const showLinearLine = showProjectionLine && savingsGrowth.rate !== 0
  const lastProjection = showProjectionLine ? chartData.at(-1) : undefined
  const spansYears = String(firstPoint?.date).slice(0, 4) !== String(lastPoint?.date).slice(0, 4)

  return (
    <ChartSection
      titleId="net-worth-trend-title"
      eyebrow="Wealth / transaction trend"
      title="Net Worth Trend"
      description="Cumulative income less expenses through each date."
      headerClassName="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      action={(
        <NetWorthViewToggles
          motionEnabled={motionEnabled}
          showProjection={showProjection}
          setShowProjection={setShowProjection}
          setShowStacked={setShowStacked}
          effectiveStacked={effectiveStacked}
          stackedAllowed={stackedAllowed}
          monthlyGrowth={monthlyGrowth}
          compounding={savingsGrowth.rate !== 0}
        />
      )}
    >
      {(() => {
        if (isLoading) {
          return <ChartSkeleton />
        }
        if (filteredNetWorthData.length === 0) {
          return (
            <EmptyState
              icon={BarChart3}
              title="No data available"
              description="Upload your transaction data to track net worth over time."
              actionLabel="Upload Data"
              actionHref="/upload"
              variant="chart"
            />
          )
        }
        // The fallback is currently unreachable -- `anchor` is null only when
        // `filteredNetWorthData` is empty, which returned above, and the marker
        // also needs `monthlyGrowth > 0` (three points minimum). It stays for the
        // type, but as a LOCAL key: the x-axis is keyed on each point's local
        // `YYYY-MM-DD`, and `toISOString()` converts to UTC first, so the moment
        // this branch ever became live it would put the marker a day left of
        // today for every user east of UTC between midnight and their offset.
        const anchorDateIso = anchor?.date ?? getTodayKey()
        return (
          <>
            <NetWorthChartSummary
              filteredNetWorthData={filteredNetWorthData}
              allCategories={allCategories}
              milestoneRows={milestoneRows}
              effectiveStacked={effectiveStacked}
              showProjectionLine={showProjectionLine}
              showLinearLine={showLinearLine}
            />
            {rows.length > 6 && <ChartRangeControls range={range} label="Net worth chart range" />}
            <NetWorthAreaPlot
              rows={rows}
              allCategories={allCategories}
              effectiveStacked={effectiveStacked}
              showProjectionLine={showProjectionLine}
              showLinearLine={showLinearLine}
              spansYears={spansYears}
              anchor={anchor}
              anchorDateIso={anchorDateIso}
              milestoneRows={milestoneRows}
              range={range}
            />
            <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">
              <p className="max-w-prose">
                  {showProjectionLine
                    ? projectionNote(monthlyGrowth, savingsGrowth)
                    : 'The trend starts at zero and accumulates recorded income less expenses. Account balance totals above can differ.'}
                  {effectiveStacked && ' Category bands use current account proportions.'}
              </p>
            </div>
            {lastProjection && typeof lastProjection.projected === 'number' && (
              <motion.p
                key={String(lastProjection.date)}
                initial={motionEnabled ? { opacity: 0, y: 6 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: motionEnabled ? 0.25 : 0 }}
                className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground"
              >
                Estimated {formatDate(String(lastProjection.date), { month: 'short', year: 'numeric' })}
                <span className="font-mono text-sm font-semibold tabular-nums text-app-blue">
                  {formatCurrency(lastProjection.projected)}
                </span>
                {showLinearLine && typeof lastProjection.linear === 'number' && (
                  <span>
                    vs {formatCurrency(lastProjection.linear)} on the straight line
                  </span>
                )}
              </motion.p>
            )}
            {chartDataTable<NetWorthPlotRow>(
              rows,
              [
                { header: 'Date', rowHeader: true, value: (row) => String(row.date ?? '') },
                { header: 'Cumulative net cash flow', value: (row) => typeof row.netWorth === 'number' ? formatCurrency(row.netWorth) : 'Not applicable' },
                ...allCategories.map((category) => ({
                  header: (CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other).label,
                  value: (row: NetWorthPlotRow) => typeof row[category] === 'number' ? formatCurrency(row[category]) : 'Not available',
                })),
                ...(showProjectionLine ? [
                  { header: 'Projected median (estimate)', value: (row: NetWorthPlotRow) => amountOrNa(row.projected) },
                  { header: 'Projected range (±1σ)', value: bandRange },
                ] : []),
                ...(showLinearLine ? [
                  { header: 'Straight-line projection (previous model)', value: (row: NetWorthPlotRow) => amountOrNa(row.linear) },
                ] : []),
              ],
              'Net worth transaction trend: cumulative income less expenses. Future values are estimates.',
              (row, index) => `${String(row.date)}-${index}`,
            )}
          </>
        )
      })()}
    </ChartSection>
  )
}

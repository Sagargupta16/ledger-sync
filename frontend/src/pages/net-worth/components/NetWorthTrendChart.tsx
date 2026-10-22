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
import { formatCurrency, formatDate } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

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
            />
            {rows.length > 6 && <ChartRangeControls range={range} label="Net worth chart range" />}
            <NetWorthAreaPlot
              rows={rows}
              allCategories={allCategories}
              effectiveStacked={effectiveStacked}
              showProjectionLine={showProjectionLine}
              spansYears={spansYears}
              anchor={anchor}
              anchorDateIso={anchorDateIso}
              milestoneRows={milestoneRows}
              range={range}
            />
            <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">
              <p className="max-w-prose">
                  {showProjectionLine
                    ? `Estimates extend this cash-flow trend by ${formatCurrency(monthlyGrowth)}/month in average savings. The shaded range is ±1σ; market returns are not included.`
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
                  { header: 'Projected median (estimate)', value: (row: NetWorthPlotRow) => typeof row.projected === 'number' ? formatCurrency(row.projected) : 'Not applicable' },
                  { header: 'Projected range (±1σ)', value: bandRange },
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

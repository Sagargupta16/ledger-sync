import { BarChart3 } from 'lucide-react'
import { motion } from 'motion/react'

import EmptyState from '@/components/shared/EmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import ChartRangeControls from '@/components/ui/ChartRangeControls'
import { useChartRange } from '@/components/ui/useChartRange'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { getTodayKey } from '@/lib/dateUtils'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

import { CATEGORY_CONFIG } from '../netWorthUtils'
import { NetWorthAreaPlot } from './NetWorthAreaPlot'
import { NetWorthChartSummary } from './NetWorthChartSummary'
import { getNetWorthChartView, type NetWorthChartRow, type NetWorthTrendChartProps } from './netWorthChartView'
import { NetWorthViewToggles } from './NetWorthViewToggles'

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
  const { hasNegativeNetWorth, stackedAllowed, effectiveStacked, plotData, animatedPointCount } = getNetWorthChartView(props)
  const range = useChartRange(plotData.map((row) => String(row.date)))
  const firstPoint = filteredNetWorthData[0]
  const lastPoint = filteredNetWorthData.at(-1)
  const showProjectionLine = showProjection && monthlyGrowth > 0 && !effectiveStacked
  const lastProjection = showProjectionLine ? chartData.at(-1) : undefined
  const spansYears = String(firstPoint?.date).slice(0, 4) !== String(lastPoint?.date).slice(0, 4)

  return (
    <motion.section
      initial={motionEnabled ? { opacity: 0, y: 16 } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: motionEnabled ? 0.45 : 0, ease: [0.22, 1, 0.36, 1] }}
      className="ledger-panel min-w-0 p-4 sm:p-6"
      aria-labelledby="net-worth-trend-title"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-app-blue">
            Wealth / transaction trend
          </p>
          <h2 id="net-worth-trend-title" className="text-lg font-semibold tracking-tight text-foreground">
            Net Worth Trend
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Cumulative income less expenses through each date.
          </p>
        </div>
        <NetWorthViewToggles
          motionEnabled={motionEnabled}
          showProjection={showProjection}
          setShowProjection={setShowProjection}
          setShowStacked={setShowStacked}
          effectiveStacked={effectiveStacked}
          stackedAllowed={stackedAllowed}
          monthlyGrowth={monthlyGrowth}
        />
      </div>
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
            {plotData.length > 6 && <ChartRangeControls range={range} label="Net worth chart range" />}
            <motion.div
              initial={motionEnabled ? { opacity: 0, y: 12 } : false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: motionEnabled ? 0.5 : 0, ease: [0.22, 1, 0.36, 1] }}
            >
              <NetWorthAreaPlot
                plotData={plotData}
                allCategories={allCategories}
                animatedPointCount={animatedPointCount}
                effectiveStacked={effectiveStacked}
                hasNegativeNetWorth={hasNegativeNetWorth}
                showProjectionLine={showProjectionLine}
                spansYears={spansYears}
                anchor={anchor}
                anchorDateIso={anchorDateIso}
                milestoneRows={milestoneRows}
                range={range}
              />
            </motion.div>
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
            {chartDataTable<NetWorthChartRow>(
              plotData,
              [
                { header: 'Date', rowHeader: true, value: (row) => String(row.date ?? '') },
                { header: 'Cumulative net cash flow', value: (row) => typeof row.netWorth === 'number' ? formatCurrency(row.netWorth) : 'Not applicable' },
                ...allCategories.map((category) => ({
                  header: (CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other).label,
                  value: (row: NetWorthChartRow) => typeof row[category] === 'number' ? formatCurrency(row[category]) : 'Not available',
                })),
                ...(showProjectionLine ? [
                  { header: 'Projected median (estimate)', value: (row: NetWorthChartRow) => typeof row.projected === 'number' ? formatCurrency(row.projected) : 'Not applicable' },
                  { header: 'Projected range (±1σ)', value: (row: NetWorthChartRow) => Array.isArray(row.projectionBand) ? row.projectionBand.map(formatCurrency).join(' to ') : 'Not applicable' },
                ] : []),
              ],
              'Net worth transaction trend: cumulative income less expenses. Future values are estimates.',
              (row, index) => `${String(row.date)}-${index}`,
            )}
          </>
        )
      })()}
    </motion.section>
  )
}

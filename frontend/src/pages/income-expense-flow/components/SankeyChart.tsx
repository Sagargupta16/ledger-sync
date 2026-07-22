import { motion } from 'framer-motion'
import { ArrowRightLeft, ChevronRight, CornerUpLeft } from 'lucide-react'
import { Sankey, Tooltip } from 'recharts'

import { ChartContainer, Spinner } from '@/components/ui'
import { chartTooltipProps } from '@/components/ui/ChartTooltip'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import type { DrillCrumb, FlowEntry, SankeyView } from '../sankeyDrilldown'
import MobileFlowView from './MobileFlowView'

interface SankeyChartProps {
  isLoading: boolean
  isMobile: boolean
  view: SankeyView
  drillPath: DrillCrumb[]
  /** 'in' after a node click, 'out' after breadcrumb/back -- picks the zoom direction. */
  drillDirection: 'in' | 'out'
  /** Clicked node's center in chart px; the drill view zooms in from this spot. */
  zoomOrigin: { x: number; y: number } | null
  drillTo: (depth: number) => void
  drillInto: (crumb: DrillCrumb, origin?: { x: number; y: number }) => void
  drillBack: () => void
  sankeyNodeComponent: React.ComponentType<{
    x: number
    y: number
    width: number
    height: number
    index: number
    payload: { name: string }
  }>
  topIncome: FlowEntry[]
  topExpense: FlowEntry[]
  totalIncome: number
  totalExpense: number
  netSavings: number
  currentFY: string
}

/** Breadcrumb: "All cash flow / Family". Earlier crumbs are buttons that
 * truncate the trail; the current level is static text. */
function DrillBreadcrumb({
  drillPath,
  drillTo,
  drillBack,
}: Readonly<{ drillPath: DrillCrumb[]; drillTo: (depth: number) => void; drillBack: () => void }>) {
  if (drillPath.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Click a category with <span className="font-semibold">›</span> to see its breakdown
      </p>
    )
  }
  return (
    <nav aria-label="Cash flow drill-down path" className="flex items-center gap-1 text-sm min-w-0">
      <button
        type="button"
        onClick={() => drillTo(0)}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        All cash flow
      </button>
      {drillPath.map((crumb, i) => {
        const isLast = i === drillPath.length - 1
        return (
          <span key={`${crumb.flow}-${crumb.label}`} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="w-3.5 h-3.5 text-text-quaternary shrink-0" aria-hidden />
            {isLast ? (
              <span className="font-semibold text-foreground truncate" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => drillTo(i + 1)}
                className="text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                {crumb.label}
              </button>
            )}
          </span>
        )
      })}
      <button
        type="button"
        onClick={drillBack}
        className="ml-2 flex items-center gap-1 px-2 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-2)] transition-colors shrink-0"
        aria-label="Back one level"
      >
        <CornerUpLeft className="w-3 h-3" aria-hidden />
        Back
      </button>
    </nav>
  )
}

export function SankeyChart(props: Readonly<SankeyChartProps>) {
  const {
    isLoading,
    isMobile,
    view,
    drillPath,
    drillDirection,
    zoomOrigin,
    drillTo,
    drillInto,
    drillBack,
    sankeyNodeComponent,
    topIncome,
    topExpense,
    totalIncome,
    totalExpense,
    netSavings,
    currentFY,
  } = props

  const depth = drillPath.length
  const crumb = drillPath.at(-1)
  const viewKey = drillPath.map((c) => `${c.flow}:${c.label}`).join('/') || 'overview'
  const chartHeight = depth === 0 ? 700 : Math.max(320, 90 * view.links.length + 120)

  // Zoom navigation. Forward: the new view grows out of the clicked node
  // (transform-origin at its chart position), like zooming INTO it. Back: the
  // parent view settles down from oversized, like zooming back OUT. The blur
  // ramp sells the depth change; the spring keeps it snappy, not floaty.
  const zoomIn = drillDirection === 'in'
  const transformOrigin =
    zoomIn && zoomOrigin ? `${zoomOrigin.x}px ${zoomOrigin.y}px` : '50% 50%'
  const enterFrom = zoomIn
    ? { opacity: 0, scale: 0.35, filter: 'blur(6px)' }
    : { opacity: 0, scale: 1.45, filter: 'blur(6px)' }

  const chartLabel = crumb
    ? `Sankey diagram showing the ${crumb.label} breakdown by subcategory.`
    : 'Sankey diagram showing income sources flowing into total income, then splitting into savings and expense categories.'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass rounded-2xl border border-border p-3 sm:p-6 lg:p-8"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && depth > 0) drillBack()
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-app-purple/20 rounded-xl">
            <ArrowRightLeft className="w-6 h-6 text-app-purple" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              <span className="sm:hidden">Cash Flow</span>
              <span className="hidden sm:inline">Cash Flow Sankey</span>
            </h3>
            <p className="text-sm text-muted-foreground">
              {crumb
                ? `Where ${crumb.label} ${crumb.flow === 'expense' ? 'goes' : 'comes from'}`
                : 'Income sources flowing to savings and expenses'}
            </p>
          </div>
        </div>
        <DrillBreadcrumb drillPath={drillPath} drillTo={drillTo} drillBack={drillBack} />
      </div>

      {isLoading && (
        <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-[var(--overlay-1)] md:h-[550px] lg:h-[700px]">
          <Spinner size="lg" label="Loading flow diagram..." />
        </div>
      )}

      {!isLoading && isMobile && (
        <MobileFlowView
          incomeByCategory={topIncome}
          expenseByCategory={topExpense}
          totalIncome={totalIncome}
          totalExpense={totalExpense}
          netSavings={netSavings}
          view={view}
          drillPath={drillPath}
          drillDirection={drillDirection}
          drillInto={drillInto}
        />
      )}

      {/* Gate on LINKS, not nodes: with no data there are 0 links and Recharts
          <Sankey> would render orphan nodes / a NaN layout. */}
      {!isLoading && !isMobile && view.links.length > 0 && (
        <div className="relative overflow-hidden rounded-lg border border-border bg-[var(--overlay-1)] p-6">
          {/* Recharts Sankey can't animate a data swap, so each drill level
              remounts (key) and zooms in. Enter-only on purpose: exit
              animations kept the old chart mounted alongside the new one
              (AnimatePresence exit never completed under StrictMode), which
              doubled the diagram. The key remount also resets stale tooltip
              active state. The outer div springs the height between levels so
              the card doesn't jump-cut when a drill view is shorter. */}
            <motion.div
              initial={false}
              animate={{ height: chartHeight }}
              transition={{ type: 'spring', stiffness: 260, damping: 32 }}
              style={{ overflow: 'hidden' }}
            >
            <motion.div
              key={viewKey}
              initial={enterFrom}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{ type: 'spring', stiffness: 220, damping: 26, mass: 0.9 }}
              style={{ transformOrigin }}
            >
              {/* Chart renders at final height immediately; the outer wrapper's
                  height spring just reveals it (no per-frame Sankey relayout). */}
              <ChartContainer height={chartHeight} ariaLabel={chartLabel}>
                <Sankey
                  key={viewKey}
                  data={{ nodes: view.nodes, links: view.links }}
                  nodeWidth={20}
                  nodePadding={depth === 0 ? 60 : 40}
                  margin={{ top: 30, right: 200, bottom: 30, left: 200 }}
                  node={sankeyNodeComponent as never}
                  link={{
                    stroke: rawColors.app.purple,
                    strokeOpacity: 0.25,
                  }}
                >
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value, _name, item) => {
                      if (typeof value !== 'number') return ''
                      // Link hovers expose resolved source/target node objects;
                      // node hovers fall back to the node's own name.
                      const link = item?.payload as
                        | { source?: { name?: string }; target?: { name?: string }; name?: string }
                        | undefined
                      const source = link?.source?.name
                      const target = link?.target?.name
                      const label =
                        source && target ? `${source} -> ${target}` : (link?.name ?? 'Amount')
                      return [formatCurrency(value), label]
                    }}
                  />
                </Sankey>
              </ChartContainer>
            </motion.div>
            </motion.div>

          {depth === 0 && (
            <div className="mt-6 pt-6 border-t border-border flex flex-wrap justify-center gap-6">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{
                    background: `linear-gradient(to right, ${rawColors.app.green}, ${rawColors.app.greenVibrant})`,
                  }}
                />
                <span className="text-sm text-foreground">Income Sources</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{
                    background: `linear-gradient(to right, ${rawColors.app.indigo}, ${rawColors.app.purple})`,
                  }}
                />
                <span className="text-sm text-foreground">Total Income / Savings</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{
                    background: `linear-gradient(to right, ${rawColors.app.red}, ${rawColors.app.redVibrant})`,
                  }}
                />
                <span className="text-sm text-foreground">Expense Categories</span>
              </div>
            </div>
          )}
        </div>
      )}

      {!isLoading && !isMobile && view.links.length === 0 && (
        <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-[var(--overlay-1)] md:h-[550px] lg:h-[700px]">
          <div className="text-center">
            <ArrowRightLeft className="w-16 h-16 text-text-quaternary mx-auto mb-4" />
            <p className="text-muted-foreground text-lg">
              {depth > 0
                ? 'No breakdown available for this selection'
                : `No transaction data available for FY ${currentFY}`}
            </p>
            <p className="text-text-tertiary text-sm mt-2">
              {depth > 0
                ? 'Go back to the full cash flow view'
                : 'Select a different financial year or upload transaction data'}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  )
}

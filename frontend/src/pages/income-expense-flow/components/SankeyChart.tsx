import { useMemo } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, ArrowRightLeft, ChevronRight, CornerUpLeft } from 'lucide-react'
import { Sankey, Tooltip } from 'recharts'

import { ChartContainer, Spinner } from '@/components/ui'
import { chartTooltipProps } from '@/components/ui/ChartTooltip'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import type { DrillCrumb, FlowEntry, SankeyView } from '../sankeyDrilldown'
import MobileFlowView from './MobileFlowView'
import { createSankeyLinkComponent } from './SankeyLinkRenderer'

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
  totalTax: number
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
        Select a category with <span className="font-semibold">›</span> to explore its breakdown
      </p>
    )
  }
  return (
    <nav aria-label="Cash flow drill-down path" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => drillTo(0)}
        className="flex min-h-11 shrink-0 items-center rounded-md px-2 text-muted-foreground transition-colors hover:bg-[var(--overlay-2)] hover:text-foreground"
      >
        All cash flow
      </button>
      {drillPath.map((crumb, i) => {
        const isLast = i === drillPath.length - 1
        return (
          // Depth in the key: the same label can legally appear twice in a
          // path (the Tax branch drilling into a category also named Tax).
          <span key={`${i}-${crumb.view}-${crumb.label}`} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="w-3.5 h-3.5 text-text-quaternary shrink-0" aria-hidden />
            {isLast ? (
              <span className="font-semibold text-foreground truncate" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => drillTo(i + 1)}
                className="flex min-h-11 items-center truncate rounded-md px-2 text-muted-foreground transition-colors hover:bg-[var(--overlay-2)] hover:text-foreground"
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
        className="ml-2 flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-[var(--overlay-2)] hover:text-foreground"
        aria-label="Back one level"
      >
        <CornerUpLeft className="w-3 h-3" aria-hidden />
        Back
      </button>
    </nav>
  )
}

function getFlowStages(crumb: DrillCrumb | undefined): string[] {
  if (!crumb) return ['Income sources', 'Income total', 'Allocation', 'Expense detail']
  return crumb.flow === 'income'
    ? ['Income breakdown', crumb.label]
    : [crumb.label, 'Expense breakdown']
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
    totalTax,
    netSavings,
    currentFY,
  } = props
  const sankeyLinkComponent = useMemo(() => createSankeyLinkComponent(view), [view])

  const depth = drillPath.length
  const crumb = drillPath.at(-1)
  const viewKey = drillPath.map((c) => `${c.flow}:${c.label}`).join('/') || 'overview'
  const chartHeight = depth === 0 ? 820 : Math.max(360, 100 * view.links.length + 140)

  // Zoom navigation. Forward: the new view grows out of the clicked node
  // (transform-origin at its chart position), like zooming INTO it. Back: the
  // parent view settles down from oversized, like zooming back OUT.
  const zoomIn = drillDirection === 'in'
  const transformOrigin =
    zoomIn && zoomOrigin ? `${zoomOrigin.x}px ${zoomOrigin.y}px` : '50% 50%'
  const enterFrom = zoomIn
    ? { opacity: 0, scale: 0.9 }
    : { opacity: 0, scale: 1.08 }

  const chartLabel = crumb
    ? `Sankey diagram showing the ${crumb.label} breakdown by subcategory.`
    : 'Sankey diagram showing income sources flowing into total income, then splitting into savings and expense categories.'

  let subtitle = 'Trace income through tax, savings, and everyday expenses.'
  if (crumb) {
    subtitle = crumb.flow === 'expense' ? `Where ${crumb.label} goes` : `Where ${crumb.label} comes from`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="ledger-panel min-w-0 p-4 sm:p-6"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && depth > 0) drillBack()
      }}
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Money in / money out
            </p>
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              <span className="sm:hidden">Cash Flow</span>
              <span className="hidden sm:inline">Cash Flow Sankey</span>
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
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
          totalTax={totalTax}
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
        <div className="min-w-0">
          <ol
            aria-label="Flow stages"
            className={`mb-5 grid gap-4 border-y border-border py-4 ${depth === 0 ? 'grid-cols-4' : 'grid-cols-2'}`}
          >
            {getFlowStages(crumb).map((stage, index, stages) => (
              <li key={`${index}-${stage}`} className="flex min-w-0 items-center gap-3">
                <span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                <span className="text-xs font-medium text-foreground">{stage}</span>
                {index < stages.length - 1 && <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
              </li>
            ))}
          </ol>
          {/* Recharts Sankey can't animate a data swap, so each drill level
              remounts (key) and zooms in. Enter-only on purpose: exit
              animations kept the old chart mounted alongside the new one
              (AnimatePresence exit never completed under StrictMode), which
              doubled the diagram. The key remount also resets stale tooltip
              active state. */}
          <div className="overflow-x-auto">
            <motion.div
              key={viewKey}
              initial={enterFrom}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 26, mass: 0.9 }}
              className="min-w-[760px]"
              style={{ transformOrigin, height: chartHeight }}
            >
              <ChartContainer height={chartHeight} ariaLabel={chartLabel}>
                <Sankey
                  key={viewKey}
                  data={{ nodes: view.nodes, links: view.links }}
                  nodeWidth={12}
                  nodePadding={depth === 0 ? 72 : 64}
                  margin={{ top: 48, right: 184, bottom: 48, left: 184 }}
                  align="left"
                  node={sankeyNodeComponent as never}
                  link={sankeyLinkComponent as never}
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
          </div>

          {depth === 0 && (
            <div className="mt-4 border-t border-border pt-5">
              <ChartSeriesLegend
                items={[
                  { key: 'income', label: 'Income sources', color: rawColors.app.green },
                  { key: 'pool', label: 'Income total', color: rawColors.app.indigoVibrant },
                  { key: 'savings', label: 'Savings', color: rawColors.app.purple },
                  { key: 'expense', label: 'Expenses', color: rawColors.app.red },
                  ...(totalTax > 0 ? [{ key: 'tax', label: 'Tax', color: rawColors.app.orange }] : []),
                ]}
                caption="Ribbon width represents amount"
              />
              {view.rowsTotal !== totalIncome && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Gross income includes computed TDS deducted at source. The summary above shows recorded income.
                </p>
              )}
            </div>
          )}
          <details className="group mt-4 border-t border-border pt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
              View amounts and breakdowns
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
            </summary>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Values for the current cash flow view</caption>
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="py-3 font-medium">Category</th>
                  <th scope="col" className="py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="py-3 pl-4 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {view.nodes.map((node, index) => {
                  const meta = view.meta[index]
                  return (
                    <tr key={`${index}-${node.name}`} className="border-b border-border/60 last:border-0">
                      <th scope="row" className="py-2 font-medium">
                        {meta?.drill ? (
                          <button
                            type="button"
                            className="inline-flex min-h-11 items-center gap-2 text-left text-foreground hover:text-primary"
                            onClick={() => { if (meta.drill) drillInto(meta.drill) }}
                          >
                            {node.name}<ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                          </button>
                        ) : node.name}
                      </th>
                      <td className="py-2 text-right font-mono text-xs tabular-nums">{formatCurrency(meta?.value ?? 0)}</td>
                      <td className="py-2 pl-4 text-right font-mono text-xs tabular-nums text-muted-foreground">{(meta?.pct ?? 0).toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </details>
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

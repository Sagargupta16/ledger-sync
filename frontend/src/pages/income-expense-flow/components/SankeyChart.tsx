import { motion } from 'motion/react'
import { ArrowRightLeft } from 'lucide-react'

import { Spinner } from '@/components/ui'

import type { DrillCrumb, FlowEntry, SankeyView } from '../sankeyDrilldown'
import DrillBreadcrumb from './DrillBreadcrumb'
import FlowDiagramPanel from './FlowDiagramPanel'
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
  topIncome: FlowEntry[]
  topExpense: FlowEntry[]
  totalIncome: number
  totalExpense: number
  totalTax: number
  netSavings: number
  currentFY: string
}

/** Cash flow card: the drillable Sankey from lg up, the vertical flow list below it. */
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
    topIncome,
    topExpense,
    totalIncome,
    totalExpense,
    totalTax,
    netSavings,
    currentFY,
  } = props

  const depth = drillPath.length
  const crumb = drillPath.at(-1)

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

      {/* Gate on LINKS, not nodes: with no data there are 0 links and nothing to lay out. */}
      {!isLoading && !isMobile && view.links.length > 0 && (
        <FlowDiagramPanel
          view={view}
          drillPath={drillPath}
          drillDirection={drillDirection}
          zoomOrigin={zoomOrigin}
          drillInto={drillInto}
          topIncome={topIncome}
          topExpense={topExpense}
          totalIncome={totalIncome}
        />
      )}

      {!isLoading && !isMobile && view.links.length === 0 && (
        <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-[var(--overlay-1)] md:h-[550px] lg:h-[700px]">
          <div className="text-center">
            <ArrowRightLeft className="w-16 h-16 text-text-quaternary mx-auto mb-4" />
            <p className="text-muted-foreground text-lg">
              {depth > 0
                ? 'No breakdown available for this selection'
                : `No transaction data available for ${currentFY}`}
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

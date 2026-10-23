import { useLayoutEffect, useMemo, useRef } from 'react'
import { useAnimate } from 'motion/react'
import { ArrowRight } from 'lucide-react'

import SankeyDiagram from '@/components/charts/SankeyDiagram'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { colors } from '@/constants/colors'
import { formatCurrencyCompact } from '@/lib/formatters'

import type { DrillCrumb, FlowEntry, SankeyView } from '../sankeyDrilldown'
import { OVERVIEW_NODE, toFlowDiagram } from '../sankeyDiagramData'
import FlowBreakdownTable from './FlowBreakdownTable'

interface Point { readonly x: number; readonly y: number }

interface FlowDiagramPanelProps {
  readonly view: SankeyView
  readonly drillPath: DrillCrumb[]
  readonly drillDirection: 'in' | 'out'
  /** The drilled node's centre in chart px; a drill zooms in from it. */
  readonly zoomOrigin: Point | null
  readonly drillInto: (crumb: DrillCrumb, origin?: Point) => void
  readonly topIncome: readonly FlowEntry[]
  readonly topExpense: readonly FlowEntry[]
  readonly totalIncome: number
}

/** The drill zoom's spring, the one the Recharts version played on every remount. */
const ZOOM = { type: 'spring', stiffness: 220, damping: 26, mass: 0.9 } as const
/** Room between stacked nodes: every label keeps its name, value and share rows. */
const NODE_PADDING = 48

/** The desktop diagram: stage headings, the zoomable Sankey, its legend and the values table. */
export default function FlowDiagramPanel({
  view, drillPath, drillDirection, zoomOrigin, drillInto, topIncome, topExpense, totalIncome,
}: FlowDiagramPanelProps) {
  const crumb = drillPath.at(-1)
  const [income, expense] = [topIncome.length, topExpense.length]
  const diagram = useMemo(() => toFlowDiagram(view, drillPath, { income, expense }), [view, drillPath, income, expense])
  const zoomScope = useDrillZoom(drillPath.map((c) => `${c.flow}:${c.label}`).join('/') || 'overview', drillDirection)
  const zoomFrom = drillDirection === 'in' && zoomOrigin ? `${zoomOrigin.x}px ${zoomOrigin.y}px` : '50% 50%'
  const height = crumb ? Math.max(360, 100 * diagram.links.length + 140) : 820
  const onNodeSelect = (id: string, center?: Point) => {
    const drill = diagram.nodes.find((node) => node.id === id)?.meta.drill
    if (drill) drillInto(drill, center)
  }
  const chartLabel = crumb
    ? `Sankey diagram showing the ${crumb.label} breakdown by subcategory.`
    : 'Sankey diagram showing income sources flowing into total income, then splitting into savings and expense categories.'

  return (
    <div className="min-w-0">
      <FlowStages crumb={crumb} />
      {/* Clips the zoom and any mark gliding in from a taller view; the bleed keeps the focus ring visible. */}
      <div className="-m-2 overflow-hidden p-2">
        <div ref={zoomScope} style={{ transformOrigin: zoomFrom }}>
          <SankeyDiagram nodes={diagram.nodes} links={diagram.links} ariaLabel={chartLabel} height={height}
            formatValue={formatCurrencyCompact} onNodeSelect={onNodeSelect} align="left" nodePadding={NODE_PADDING}
            total={view.rowsTotal} totalLabel={diagram.totalLabel} />
        </div>
      </div>
      {!crumb && (
        <div className="mt-4 border-t border-border pt-5">
          <ChartSeriesLegend items={legendItems(new Set(diagram.nodes.map((node) => node.id)))} caption="Ribbon width represents amount" />
          {view.rowsTotal !== totalIncome && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Gross income includes computed TDS deducted at source. The summary above shows recorded income.
            </p>
          )}
        </div>
      )}
      <FlowBreakdownTable nodes={diagram.nodes} drillInto={drillInto} />
    </div>
  )
}

/**
 * Replays the drill zoom on every view change while the diagram stays mounted, so its nodes still morph:
 * a drill grows the new view out of the clicked node, Back settles it down from oversized. The scoped
 * animate follows MotionConfig, so the Reduced setting skips it.
 */
function useDrillZoom(viewKey: string, direction: 'in' | 'out') {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const shown = useRef(viewKey)
  useLayoutEffect(() => {
    if (shown.current === viewKey || !scope.current) return
    shown.current = viewKey
    void animate(scope.current, { scale: [direction === 'in' ? 0.9 : 1.08, 1] }, ZOOM)
  }, [viewKey, direction, animate, scope])
  return scope
}

/** Only the branches this period draws: a deficit has no Savings, most periods no realised losses. */
function legendItems(drawn: ReadonlySet<string>) {
  const optional = (id: string, key: string, label: string, color: string) => (drawn.has(id) ? [{ key, label, color }] : [])
  return [
    { key: 'income', label: 'Income sources', color: colors.app.green },
    { key: 'pool', label: 'Income total', color: colors.app.indigoVibrant },
    ...optional(OVERVIEW_NODE.savings, 'savings', 'Savings', colors.app.purple),
    ...optional(OVERVIEW_NODE.expenses, 'expense', 'Expenses', colors.app.red),
    ...optional(OVERVIEW_NODE.tax, 'tax', 'Tax', colors.app.orange),
    ...optional(OVERVIEW_NODE.losses, 'losses', 'Realised losses', colors.app.yellow),
  ]
}

function getFlowStages(crumb: DrillCrumb | undefined): string[] {
  if (!crumb) return ['Income sources', 'Income total', 'Allocation', 'Expense detail']
  return crumb.flow === 'income' ? ['Income breakdown', crumb.label] : [crumb.label, 'Expense breakdown']
}

function FlowStages({ crumb }: Readonly<{ crumb: DrillCrumb | undefined }>) {
  const stages = getFlowStages(crumb)
  return (
    <ol aria-label="Flow stages" className={`mb-5 grid gap-4 border-y border-border py-4 ${crumb ? 'grid-cols-2' : 'grid-cols-4'}`}>
      {stages.map((stage, index) => (
        <li key={`${index}-${stage}`} className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
          <span className="text-xs font-medium text-foreground">{stage}</span>
          {index < stages.length - 1 && <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  )
}

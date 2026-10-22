/**
 * Maps a drill-down SankeyView (nodes by array index plus a parallel meta array) onto SankeyDiagram's
 * id-keyed graph. An id is a pure function of the view and its crumb, so a node shown at two levels keeps
 * one id and the diagram morphs it between them: the drilled category is one node in the overview and as
 * the parent of its breakdown, and a category inside "Other" is one node there and in its own drill.
 */

import type { SankeyDiagramNode } from '@/components/charts/SankeyDiagram'
import type { SankeyLinkInput } from '@/components/charts/sankeyLayout'
import { formatPercent } from '@/lib/formatters'

import { isTaxCategory, type DrillCrumb, type SankeyNodeMeta, type SankeyView } from './sankeyDrilldown'

export interface FlowNode extends SankeyDiagramNode {
  readonly meta: SankeyNodeMeta
}

export interface FlowDiagram {
  /** Only nodes a positive link touches: a deficit period's empty Savings is not drawn or listed. */
  readonly nodes: readonly FlowNode[]
  readonly links: readonly SankeyLinkInput[]
  /** What the shares are of: "gross income", "total income" or the drilled parent. */
  readonly totalLabel: string
}

/** How many overview nodes come before and after buildOverviewView's fixed middle block. */
export interface OverviewCounts {
  readonly income: number
  readonly expense: number
}

/** Ids of the overview's fixed nodes, the block buildOverviewView puts between income and expense entries. */
export const OVERVIEW_NODE = {
  tds: 'flow:tds',
  gross: 'flow:gross',
  tax: 'flow:tax',
  losses: 'flow:losses',
  savings: 'flow:savings',
  expenses: 'flow:expenses',
} as const

const FIXED_IDS: Readonly<Partial<Record<string, string>>> = {
  'Tax Deducted at Source': OVERVIEW_NODE.tds,
  'Gross Income': OVERVIEW_NODE.gross,
  'Total Income': OVERVIEW_NODE.gross,
  Tax: OVERVIEW_NODE.tax,
  'Realised losses': OVERVIEW_NODE.losses,
  Savings: OVERVIEW_NODE.savings,
  Expenses: OVERVIEW_NODE.expenses,
}
/** The label useIncomeExpenseFlow gives the Tax node's own breakdown crumb. */
const TAX_CRUMB_LABEL = 'Tax'

export function toFlowDiagram(view: SankeyView, drillPath: readonly DrillCrumb[], counts: OverviewCounts): FlowDiagram {
  const crumb = drillPath.at(-1)
  const ids = unique(crumb ? drillIds(view, crumb, drillPath.length) : overviewIds(view, counts))
  // A ribbon takes the colour of the end it is about, so ribbons into an aggregate (the income hub, an
  // income category fed by its subcategories) are coloured by their source and every other by its target.
  let aggregate = -1
  if (!crumb) aggregate = ids.indexOf(OVERVIEW_NODE.gross)
  else if (crumb.flow === 'income') aggregate = view.nodes.length - 1
  const positive = view.links.filter((link) => link.value > 0)
  const linked = new Set(positive.flatMap((link) => [link.source, link.target]))
  const nodes = view.nodes.flatMap((node, index): FlowNode[] => {
    const meta = view.meta[index]
    if (!meta || !linked.has(index)) return []
    return [{
      id: ids[index], label: node.name, color: meta.color, displayValue: meta.value,
      detail: formatPercent(meta.pct), selectable: meta.drill !== null, meta,
    }]
  })
  const links = positive.map((link) => ({
    source: ids[link.source], target: ids[link.target], value: link.value,
    color: view.meta[link.target === aggregate ? link.source : link.target]?.color,
  }))
  const totalLabel = crumb ? crumb.label : (view.nodes[aggregate]?.name ?? 'Total Income').toLowerCase()
  return { nodes, links, totalLabel }
}

/** Income and expense entries keyed by flow and name; the fixed middle block by role, never by name alone. */
function overviewIds(view: SankeyView, counts: OverviewCounts): string[] {
  const fixedEnd = view.nodes.length - counts.expense
  return view.nodes.map(({ name }, index) => {
    if (index < counts.income) return `income:${name}`
    if (index >= fixedEnd) return `expense:${name}`
    return FIXED_IDS[name] ?? `flow:${name}`
  })
}

/** The parent keeps the id of the node that was drilled; children are categories or the parent's subcategories. */
function drillIds(view: SankeyView, crumb: DrillCrumb, depth: number): string[] {
  const parent = parentId(crumb, depth)
  const parentIndex = crumb.flow === 'income' ? view.nodes.length - 1 : 0
  return view.nodes.map(({ name }, index) => {
    if (index === parentIndex) return parent
    return crumb.view === 'category' ? `${parent}/${name}` : `${crumb.flow}:${name}`
  })
}

/**
 * The overview's Tax node drills either into its own "other" breakdown or, with one entry, straight into
 * that tax category; both open from the Tax node. Tax-named categories never reach the expense entries
 * (they are split off as tax), so at depth 1 a tax-named category crumb can only have come from there.
 */
function parentId(crumb: DrillCrumb, depth: number): string {
  const fromTax = depth === 1 && crumb.flow === 'expense'
    && (crumb.view === 'other' ? crumb.label === TAX_CRUMB_LABEL : isTaxCategory(crumb.label))
  return fromTax ? OVERVIEW_NODE.tax : `${crumb.flow}:${crumb.label}`
}

/** The layout rejects a repeated id, and a category may legally share a name with an "Other (n)" fold. */
function unique(ids: readonly string[]): string[] {
  const used = new Set<string>()
  return ids.map((id) => {
    let candidate = id
    for (let repeat = 1; used.has(candidate); repeat++) candidate = `${id}#${repeat}`
    used.add(candidate)
    return candidate
  })
}

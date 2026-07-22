/**
 * Drill-down dataset builders for the Cash Flow Sankey.
 *
 * Pattern: replace-view (the whole diagram swaps to a scoped one) with a
 * breadcrumb back -- the shape every library that documents Sankey drill-down
 * uses (amCharts drill-down tutorial, Google Charts / ECharts click+redraw).
 * Expand-in-place reflows the entire layout on every toggle and Recharts
 * cannot animate a data swap, so it would snap-jump; replace-view keeps each
 * view stable and gives subcategories the full canvas.
 *
 * Every level builds a FRESH { nodes, links } object because Recharts links
 * reference nodes by numeric array index -- indexes must be rebuilt per view.
 * A parallel `meta` array (value, pct, color, drill target) replaces the old
 * role-by-index-range logic, which is wrong for any topology but level 0.
 */

import { rawColors } from '@/constants/colors'
import type { Transaction } from '@/types'

/** One list row / child node: category or subcategory with its total. */
export interface FlowEntry {
  name: string
  amount: number
  /** Crumb to push when activated; null/undefined = leaf (not drillable). */
  drill?: DrillCrumb | null
}

/** One level of the drill path (breadcrumb entry). */
export interface DrillCrumb {
  /** Node label the user activated, e.g. "Family" or "Other Expense (4)". */
  label: string
  /** 'category' shows its subcategories; 'other' unfolds the folded tail. */
  view: 'category' | 'other'
  flow: 'income' | 'expense'
  /** view='other' only: the folded tail categories to display. */
  tail?: FlowEntry[]
}

export interface SankeyNodeMeta {
  value: number
  /** Share of the view's base total, 0-100. */
  pct: number
  color: string
  drill: DrillCrumb | null
}

export interface SankeyView {
  nodes: Array<{ name: string }>
  links: Array<{ source: number; target: number; value: number }>
  meta: SankeyNodeMeta[]
  /** Child-side rows for the mobile list (same drill crumbs as the nodes). */
  rows: FlowEntry[]
  rowsTotal: number
}

export const SANKEY_TOP_N = 8

/** Category names that are tax outflows, not living expenses. Keyword match
 * keeps it dynamic (no hardcoded user category list). */
const TAX_PATTERN = /\btax(es)?\b|\btds\b|income tax|advance tax|self assessment/i

export const isTaxCategory = (name: string): boolean => TAX_PATTERN.test(name)

const INCOME_CYCLE = [
  rawColors.app.green,
  rawColors.app.green,
  rawColors.app.greenVibrant,
  rawColors.app.teal,
  rawColors.app.tealVibrant,
]
const EXPENSE_CYCLE = [
  rawColors.app.red,
  rawColors.app.redVibrant,
  rawColors.app.pink,
  rawColors.app.pinkVibrant,
]

const cycleColor = (flow: 'income' | 'expense', i: number): string => {
  const cycle = flow === 'income' ? INCOME_CYCLE : EXPENSE_CYCLE
  return cycle[i % cycle.length]
}

const pctOf = (amount: number, base: number): number => (base > 0 ? (amount / base) * 100 : 0)

/** Label for rows whose subcategory is empty (matches the spending-rule page). */
const NO_SUBCATEGORY = '(no subcategory)'

/**
 * Cap a category map to the top N by amount, folding the remainder into a
 * single "Other (n)" bucket so visible flows still sum to the KPI totals.
 * Returns the folded tail too so the "Other" node can drill into it.
 */
export function foldTopWithOther(
  byCategory: Record<string, number>,
  otherLabel: string,
): { entries: FlowEntry[]; tail: FlowEntry[] } {
  const sorted = Object.entries(byCategory)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
  if (sorted.length <= SANKEY_TOP_N) {
    return { entries: sorted.map(([name, amount]) => ({ name, amount })), tail: [] }
  }
  const entries = sorted.slice(0, SANKEY_TOP_N).map(([name, amount]) => ({ name, amount }))
  const tail = sorted.slice(SANKEY_TOP_N).map(([name, amount]) => ({ name, amount }))
  const otherAmount = tail.reduce((sum, e) => sum + e.amount, 0)
  entries.push({ name: `${otherLabel} (${tail.length})`, amount: otherAmount })
  return { entries, tail }
}

/** Distinct positive subcategory buckets per category, per flow. Drives "is
 * this category worth drilling into" (>= 2 buckets; a single bucket view
 * would just restate the category). */
export function countSubBuckets(
  transactions: Transaction[],
): { income: Map<string, Set<string>>; expense: Map<string, Set<string>> } {
  const income = new Map<string, Set<string>>()
  const expense = new Map<string, Set<string>>()
  for (const txn of transactions) {
    let map: Map<string, Set<string>>
    if (txn.type === 'Income') map = income
    else if (txn.type === 'Expense') map = expense
    else continue
    if (txn.amount <= 0) continue
    const category = txn.category || (map === income ? 'Other Income' : 'Other Expense')
    const sub = txn.subcategory?.trim() || NO_SUBCATEGORY
    if (!map.has(category)) map.set(category, new Set())
    map.get(category)!.add(sub)
  }
  return { income, expense }
}

const categoryCrumb = (flow: 'income' | 'expense', label: string): DrillCrumb => ({
  label,
  view: 'category',
  flow,
})

/** Attach drill crumbs to overview entries: categories with >= 2 sub-buckets
 * drill to subcategories; the folded "Other (n)" node drills to its tail. */
export function attachOverviewDrills(
  entries: FlowEntry[],
  tail: FlowEntry[],
  flow: 'income' | 'expense',
  subBuckets: Map<string, Set<string>>,
): FlowEntry[] {
  const hasSubs = (name: string) => (subBuckets.get(name)?.size ?? 0) >= 2
  const tailWithDrills = tail.map((e) => ({
    ...e,
    drill: hasSubs(e.name) ? categoryCrumb(flow, e.name) : null,
  }))
  return entries.map((e, i) => {
    const isOtherFold = tail.length > 0 && i === entries.length - 1
    if (isOtherFold) {
      return { ...e, drill: { label: e.name, view: 'other', flow, tail: tailWithDrills } }
    }
    return { ...e, drill: hasSubs(e.name) ? categoryCrumb(flow, e.name) : null }
  })
}

/**
 * Category drill view: one parent node and its subcategory breakdown.
 * Expenses read left-to-right as parent -> subs (money flowing out);
 * income reads subs -> parent (money flowing in). Subcategories beyond the
 * top N fold into a non-drillable "Other".
 */
export function buildCategoryView(transactions: Transaction[], crumb: DrillCrumb): SankeyView {
  const txnType = crumb.flow === 'income' ? 'Income' : 'Expense'
  const bySub: Record<string, number> = {}
  for (const txn of transactions) {
    if (txn.type !== txnType || txn.amount <= 0) continue
    const category = txn.category || (crumb.flow === 'income' ? 'Other Income' : 'Other Expense')
    if (category !== crumb.label) continue
    const sub = txn.subcategory?.trim() || NO_SUBCATEGORY
    bySub[sub] = (bySub[sub] || 0) + txn.amount
  }
  const { entries } = foldTopWithOther(bySub, 'Other')
  const total = entries.reduce((sum, e) => sum + e.amount, 0)
  return buildParentChildView(crumb, entries, total)
}

/** "Other (n)" drill view: unfold the tail categories the overview folded.
 * Tail entries carry their own category crumbs, so a category inside Other
 * can drill one level deeper to its subcategories. */
export function buildOtherView(crumb: DrillCrumb): SankeyView {
  const entries = crumb.tail ?? []
  const total = entries.reduce((sum, e) => sum + e.amount, 0)
  return buildParentChildView(crumb, entries, total)
}

/** Shared two-column layout: parent on the money-source side, children on the
 * other, links always oriented left-to-right in flow direction. */
function buildParentChildView(crumb: DrillCrumb, children: FlowEntry[], total: number): SankeyView {
  const parentColor = crumb.flow === 'income' ? rawColors.app.greenVibrant : rawColors.app.red
  const parentMeta: SankeyNodeMeta = { value: total, pct: 100, color: parentColor, drill: null }

  const nodes: Array<{ name: string }> = []
  const links: Array<{ source: number; target: number; value: number }> = []
  const meta: SankeyNodeMeta[] = []

  const positive = children.filter((e) => e.amount > 0)

  if (crumb.flow === 'expense') {
    // Parent (index 0) -> children.
    nodes.push({ name: crumb.label })
    meta.push(parentMeta)
    positive.forEach((e, i) => {
      nodes.push({ name: e.name })
      meta.push({ value: e.amount, pct: pctOf(e.amount, total), color: cycleColor('expense', i), drill: e.drill ?? null })
      links.push({ source: 0, target: nodes.length - 1, value: e.amount })
    })
  } else {
    // Children -> parent (last index): income still flows left-to-right.
    positive.forEach((e, i) => {
      nodes.push({ name: e.name })
      meta.push({ value: e.amount, pct: pctOf(e.amount, total), color: cycleColor('income', i), drill: e.drill ?? null })
    })
    nodes.push({ name: crumb.label })
    meta.push(parentMeta)
    const parentIndex = nodes.length - 1
    positive.forEach((_, i) => {
      links.push({ source: i, target: parentIndex, value: positive[i].amount })
    })
  }

  return { nodes, links, meta, rows: positive, rowsTotal: total }
}

/**
 * Level-0 overview: income sources -> Total Income -> Tax + Savings +
 * Expenses -> expense categories. Same topology the page always had plus an
 * optional first-class Tax branch, with per-node meta (color, pct, drill
 * target) instead of index-range arithmetic.
 */
export function buildOverviewView(args: {
  incomeEntries: FlowEntry[]
  expenseEntries: FlowEntry[]
  totalIncome: number
  totalExpense: number
  netSavings: number
  /** Total tax burden shown on the Tax branch (explicit tax transactions plus
   * the computed TDS below). 0 hides the branch. */
  totalTax?: number
  /**
   * Slab-computed tax deducted at source (from the FY tax engine), i.e. money
   * that never hit the ledger because salary is recorded net of TDS. Shown at
   * BOTH ends: a source node feeding Gross Income on the left, and inside the
   * Tax branch on the right, so gross in still equals out.
   */
  tdsAtSource?: number
  /** Crumb for drilling into the Tax node's own breakdown. */
  taxDrill?: DrillCrumb | null
}): SankeyView {
  const { incomeEntries, expenseEntries, totalIncome, totalExpense, netSavings } = args
  const totalTax = args.totalTax ?? 0
  const tdsAtSource = args.tdsAtSource ?? 0

  // Recorded income + implied TDS = the gross every percentage is based on.
  const grossIncome = totalIncome + tdsAtSource

  const nodes: Array<{ name: string }> = []
  const links: Array<{ source: number; target: number; value: number }> = []
  const meta: SankeyNodeMeta[] = []

  incomeEntries.forEach((e, i) => {
    nodes.push({ name: e.name })
    meta.push({ value: e.amount, pct: pctOf(e.amount, grossIncome), color: cycleColor('income', i), drill: e.drill ?? null })
  })

  // TDS enters as an income-side source: part of gross pay that went straight
  // to the taxman without touching a bank account.
  let tdsIndex = -1
  if (tdsAtSource > 0) {
    tdsIndex = nodes.length
    nodes.push({ name: 'Tax Deducted at Source' })
    meta.push({ value: tdsAtSource, pct: pctOf(tdsAtSource, grossIncome), color: rawColors.app.orange, drill: null })
  }

  const totalIncomeIndex = nodes.length
  nodes.push({ name: tdsAtSource > 0 ? 'Gross Income' : 'Total Income' })
  meta.push({ value: grossIncome, pct: 100, color: rawColors.app.indigoVibrant, drill: null })

  // Tax leaves income before anything else -- its own branch, not an expense
  // category, so "Expenses" reads as living costs and "Savings" stays honest.
  let taxIndex = -1
  if (totalTax > 0) {
    taxIndex = nodes.length
    nodes.push({ name: 'Tax' })
    meta.push({ value: totalTax, pct: pctOf(totalTax, grossIncome), color: rawColors.app.orange, drill: args.taxDrill ?? null })
  }

  const savingsIndex = nodes.length
  nodes.push({ name: 'Savings' })
  meta.push({ value: Math.max(netSavings, 0), pct: pctOf(Math.max(netSavings, 0), grossIncome), color: rawColors.app.purple, drill: null })

  const expensesIndex = nodes.length
  nodes.push({ name: 'Expenses' })
  meta.push({ value: totalExpense, pct: pctOf(totalExpense, grossIncome), color: rawColors.app.red, drill: null })

  expenseEntries.forEach((e, i) => {
    nodes.push({ name: e.name })
    meta.push({ value: e.amount, pct: pctOf(e.amount, grossIncome), color: cycleColor('expense', i), drill: e.drill ?? null })
    links.push({ source: expensesIndex, target: nodes.length - 1, value: e.amount })
  })

  incomeEntries.forEach((e, i) => {
    links.push({ source: i, target: totalIncomeIndex, value: e.amount })
  })
  if (tdsIndex >= 0) links.push({ source: tdsIndex, target: totalIncomeIndex, value: tdsAtSource })
  if (taxIndex >= 0) links.push({ source: totalIncomeIndex, target: taxIndex, value: totalTax })
  if (netSavings > 0) links.push({ source: totalIncomeIndex, target: savingsIndex, value: netSavings })
  if (totalExpense > 0) links.push({ source: totalIncomeIndex, target: expensesIndex, value: totalExpense })

  return { nodes, links, meta, rows: [], rowsTotal: grossIncome }
}

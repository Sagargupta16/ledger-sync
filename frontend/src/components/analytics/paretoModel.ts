/**
 * Pure model behind ParetoChart: spend ranked largest first, the long tail rolled
 * into one "Other" bar, and the running share the cumulative line plots. Nothing
 * here touches React or the DOM, so the 80/20 maths and the tooltip formats are
 * tested directly.
 */

import type { TooltipSeries } from '@/components/charts/CartesianTooltip'
import { cumulativeShareCutoff } from '@/lib/distribution'
import { formatCurrency, formatPercent } from '@/lib/formatters'

/** Display name of the cumulative-share series, in the legend and the tooltip. */
export const CUMULATIVE_SERIES_NAME = 'Cumulative %'

/** Longest x-axis label; a longer one ends in an ellipsis. */
const LABEL_CHARS = 14
/** Key of the synthetic tail bar. Real labels are keyed `item:<label>`, so it never collides. */
const TAIL_KEY = 'tail'

export interface ParetoRow {
  /**
   * Unique category key. A real "Other" label and the synthetic tail bar both
   * read "Other", so the chart keys rows by this and shows `category`.
   */
  readonly key: string
  readonly category: string
  readonly amount: number
  readonly cumulative: number
  readonly cumulativePct: number
  /**
   * Bar colour, carried on the row so it travels with its category: the vital
   * few get `palette.vital`, every other label and the synthetic "Other" `palette.tail`.
   */
  readonly fill: string
}

export interface ParetoModel {
  readonly rows: readonly ParetoRow[]
  /**
   * How many labels it takes to cross the threshold, counted over EVERY label,
   * not the capped bar list. Counting over the capped list made the headline max
   * out at `maxBars` and could count the synthetic "Other" bucket as one label,
   * which contradicted the same statistic computed elsewhere on the page.
   */
  readonly vitalFewCount: number
}

export interface ParetoOptions {
  /** Most bars drawn; past it the long tail rolls into one "Other" bar. */
  readonly maxBars: number
  /** Cumulative share, in percent, that the vital few reach. */
  readonly threshold: number
  readonly palette: { readonly vital: string; readonly tail: string }
}

const sumOf = (rows: readonly { readonly amount: number }[]) => rows.reduce((sum, row) => sum + row.amount, 0)

/** Ranks absolute spend largest first; past `maxBars` labels the tail becomes one "Other" bar. */
export function buildParetoModel(
  breakdown: Readonly<Record<string, number>>,
  { maxBars, threshold, palette }: ParetoOptions,
): ParetoModel {
  const sorted = Object.entries(breakdown)
    .map(([category, amount]) => ({ key: `item:${category}`, category, amount: Math.abs(amount) }))
    .sort((a, b) => b.amount - a.amount)
  const total = sumOf(sorted)
  if (sorted.length === 0 || total === 0) return { rows: [], vitalFewCount: 0 }

  // The total is taken BEFORE capping, so bucketing never changes the maths,
  // only how many bars are drawn.
  const head = sorted.length > maxBars
    ? [...sorted.slice(0, maxBars - 1), { key: TAIL_KEY, category: 'Other', amount: sumOf(sorted.slice(maxBars - 1)) }]
    : sorted
  const { count: vitalFewCount } = cumulativeShareCutoff(sorted.map((row) => row.amount), total, threshold)

  let running = 0
  const rows = head.map((row, index) => {
    running += row.amount
    // The synthetic "Other" merges labels from both sides of the cutoff, so it is never vital few.
    const vital = row.key !== TAIL_KEY && index < vitalFewCount
    return { ...row, cumulative: running, cumulativePct: (running / total) * 100, fill: vital ? palette.vital : palette.tail }
  })
  return { rows, vitalFewCount }
}

/** Enough English for the nouns this chart labels ('category' -> 'categories'). */
export function pluralize(noun: string): string {
  return noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`
}

/** The card's one-line takeaway: how many labels make up the threshold share. */
export function buildParetoSummary(
  rowCount: number,
  vitalFewCount: number,
  threshold: number,
  itemNoun: string,
  plural: string,
): string {
  if (rowCount === 0) return `Which ${plural} make up ${threshold}% of your spend`
  const countedNoun = vitalFewCount === 1 ? itemNoun : plural
  const verb = vitalFewCount === 1 ? 'makes' : 'make'
  return `${vitalFewCount} ${countedNoun} ${verb} up ${threshold}% of your spend -- the rest are the long tail`
}

/**
 * Tooltip rows, each format tied to its own series key, so spend always reads as
 * currency and the running share as a percentage. Both formatters are wrapped
 * because the tooltip passes the row second, which formatPercent would take as
 * its `showSign` flag.
 */
export function paretoTooltipSeries(spendColor: string, shareColor: string): TooltipSeries[] {
  return [
    { key: 'amount', label: 'Spend', color: spendColor, format: (value) => formatCurrency(value) },
    { key: 'cumulativePct', label: CUMULATIVE_SERIES_NAME, color: shareColor, format: (value) => formatPercent(value) },
  ]
}

/** An x-axis label of at most 14 characters. */
export function truncateLabel(label: string): string {
  return label.length > LABEL_CHARS ? `${label.slice(0, LABEL_CHARS - 1)}…` : label
}

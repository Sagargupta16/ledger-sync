/**
 * Pure layout for SlopeChart; no DOM. Ranks both periods, fits the label columns and the plot to the frame, spreads
 * each side's labels so neighbours keep a minimum gap inside the plot (each keeps its point's true y, for a leader
 * line back to it), and picks the item under a pointer. Text is measured by character count, as across the kit.
 */

import { formatPercent, percentChange } from '@/lib/formatters'

import { linearScale } from './scales'

/** One line: `start` plots on the left axis, `end` on the right. Keys must be unique and stable. */
export interface SlopeDatum { readonly key: string; readonly label: string; readonly start: number; readonly end: number }

/** Which way is good news: for 'spending' a rise draws in the expense colour, for 'income' in the income colour. */
export type SlopeDirection = 'spending' | 'income'

/** Rank 1 is the largest value and ties share a rank (1, 2, 2, 4); `move` is places climbed (+2 rose two, -1 fell one). */
export interface SlopeRank { readonly start: number; readonly end: number; readonly move: number }

/** A datum with its display text, ranks and line colour; `change` reads "+₹200.00 (+25.0%)" or "no change". */
export interface SlopeItem extends SlopeDatum {
  readonly startText: string; readonly endText: string; readonly change: string; readonly rank: SlopeRank; readonly color: string
}

/** A label's key and the true y of the point it names; `labelY` is its centre after spreading. */
export interface LabelSpot { readonly key: string; readonly y: number }
export interface PlacedLabel extends LabelSpot { readonly labelY: number }

/** Label boxes are `size` tall, keep `gap` between neighbours and stay between `top` and `bottom`. */
export interface SpreadOptions { readonly size: number; readonly gap: number; readonly top: number; readonly bottom: number }

/** A laid-out item: `name` cut to its column, its point on each axis (`y0`, `y1`) and each side's label centre. */
export interface SlopePoint extends SlopeItem {
  readonly name: string; readonly y0: number; readonly y1: number; readonly label0: number; readonly label1: number
}

/** A period name centred on its axis unless that crosses an edge, in one or two lines bottom-aligned with the other. */
export interface SlopeHeader { readonly x: number; readonly lines: readonly { readonly text: string; readonly y: number }[] }

export interface SlopeLayout {
  /** Items top-down by end value, the keyboard's order. */
  readonly points: readonly SlopePoint[]
  /** Left and right axis x, and the pixel y of the largest and smallest value. */
  readonly x0: number; readonly x1: number; readonly top: number; readonly bottom: number
  /** Start values sit between the names and the left axis (narrow frames drop them); names end `nameEnd` px before them. */
  readonly startValues: boolean; readonly nameEnd: number
  /** Font size, label row height, and the gap between each label column and its axis, where the leaders run. */
  readonly font: number; readonly line: number; readonly lead: number
  readonly headers: readonly [SlopeHeader, SlopeHeader]
}

type Size = { readonly width: number; readonly height: number }

const [GOOD, BAD, FLAT] = ['var(--color-income)', 'var(--color-expense)', 'var(--chart-neutral)']
/** Average Inter advance, and JetBrains Mono's fixed one with a little room, as shares of the font size. */
const [SANS_EM, MONO_EM] = [0.58, 0.62]
/** The plot keeps this width (px, and share of the frame) before names give way, and stops growing at MAX_PLOT. */
const [MIN_PLOT, PLOT_SHARE, MAX_PLOT] = [64, 0.22, 480]
/** Start values give way before names would drop under MIN_NAME_CHARS; names never pass NAME_MAX px. */
const [MIN_NAME_CHARS, NAME_MAX] = [10, 220]
/** Px gaps: name to start value, between the two period names, under them, between neighbouring labels, at the foot. */
const [NAME_GAP, HEADER_GAP, HEADER_PAD, LABEL_GAP, EDGE] = [12, 8, 6, 2, 2]
/** Px between an end value and its rank move; the chart's tspan keeps the same gap. */
export const RANK_GAP = 6
const STEPS: Partial<Record<string, number>> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }
const EPSILON = 1e-6

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))
const finite = (value: number) => (Number.isFinite(value) ? value : 0)

/** `text` cut to `chars`, ending in an ellipsis when it is longer. */
export function truncate(text: string, chars: number): string {
  return text.length <= chars ? text : `${text.slice(0, Math.max(1, chars - 1)).trimEnd()}…`
}

/** Each item's rank in both periods among `data`, and the places it climbed; aligned with `data`. */
export function rankMoves(data: readonly Pick<SlopeDatum, 'start' | 'end'>[]): SlopeRank[] {
  const place = (value: number, side: 'start' | 'end') => 1 + data.filter((other) => other[side] > value).length
  return data.map((item) => {
    const [start, end] = [place(item.start, 'start'), place(item.end, 'end')]
    return { start, end, move: start - end }
  })
}

/** "+₹200.00 (+25.0%)": the signed difference, and the percentage when the start is not zero. */
export function changeText(start: number, end: number, format: (value: number) => string): string {
  const amount = `${end < start ? '-' : '+'}${format(Math.abs(end - start))}`
  const percent = percentChange(end, start)
  return percent === null ? amount : `${amount} (${formatPercent(percent, true)})`
}

/** The rank move printed beside an end value: "+2", "-1", or nothing when the rank held. */
export function moveText(move: number): string {
  if (move === 0) return ''
  return move > 0 ? `+${move}` : String(move)
}

/** Ranks in words, for the live region, the readout and data tables: "3 to 1, up 2" or "2, unchanged". */
export function rankWords({ start, end, move }: SlopeRank): string {
  if (move === 0) return `${end}, unchanged`
  return `${start} to ${end}, ${move > 0 ? 'up' : 'down'} ${Math.abs(move)}`
}

/** What the live region reads for an item: both values, the change and the rank move. */
export function describeItem(item: SlopeItem, startLabel: string, endLabel: string): string {
  return `${item.label}: ${startLabel} ${item.startText}, ${endLabel} ${item.endText}, ${item.change}, rank ${rankWords(item.rank)}`
}

/** Muted when both values read the same; otherwise the income colour for good news and the expense colour for bad. */
function lineColor(flat: boolean, rose: boolean, direction: SlopeDirection): string {
  if (flat) return FLAT
  return rose === (direction === 'income') ? GOOD : BAD
}

/** Items with texts, ranks and colour, top-down by end value (ties keep data order); a non-finite value plots as 0. */
export function slopeItems(data: readonly SlopeDatum[], direction: SlopeDirection, format: (value: number) => string): SlopeItem[] {
  const clean = data.map((item) => ({ ...item, start: finite(item.start), end: finite(item.end) }))
  const ranks = rankMoves(clean)
  return clean.map((item, index) => {
    const [startText, endText] = [format(item.start), format(item.end)]
    const flat = startText === endText
    return {
      ...item, startText, endText, rank: ranks[index], color: lineColor(flat, item.end > item.start, direction),
      change: flat ? 'no change' : changeText(item.start, item.end, format),
    }
  }).sort((a, b) => b.end - a.end)
}

/**
 * Labels top-down, each as near its point as it can sit while neighbouring boxes keep `gap` apart and every box stays
 * between `top` and `bottom`. Labels that would overlap gather into a run centred on their points; runs merge until
 * none overlap. When a side cannot hold every label at the full gap, the step shrinks evenly so all still fit.
 */
export function spreadLabels(spots: readonly LabelSpot[], { size, gap, top, bottom }: SpreadOptions): PlacedLabel[] {
  const sorted = [...spots].sort((a, b) => a.y - b.y)
  const first = top + size / 2
  const last = Math.max(first, bottom - size / 2)
  const step = sorted.length > 1 ? Math.min(size + gap, (last - first) / (sorted.length - 1)) : 0
  // A run lays `count` labels from sorted index `from`, one step apart. `sum` adds y - k * step over its members (k
  // counted from the run's first), so sum / count is the start that best fits their points.
  type Run = { readonly from: number; readonly count: number; readonly sum: number }
  const startOf = (run: Run) => clamp(run.sum / run.count, first, last - (run.count - 1) * step)
  const runs: Run[] = []
  sorted.forEach((spot, index) => {
    let run: Run = { from: index, count: 1, sum: spot.y }
    let above = runs.at(-1)
    while (above && startOf(above) + above.count * step > startOf(run) + EPSILON) {
      runs.pop()
      run = { from: above.from, count: above.count + run.count, sum: above.sum + run.sum - run.count * above.count * step }
      above = runs.at(-1)
    }
    runs.push(run)
  })
  return runs.flatMap((run) => {
    const at = startOf(run)
    return sorted.slice(run.from, run.from + run.count).map((spot, k) => ({ ...spot, labelY: at + k * step }))
  })
}

/** A period name on one line, or two split before a parenthesis or at the last space that fits; the rest is cut. */
function wrapLabel(text: string, chars: number): string[] {
  if (text.length <= chars) return [text]
  const qualifier = text.indexOf(' (')
  const cut = qualifier > 0 && qualifier <= chars ? qualifier : text.lastIndexOf(' ', chars)
  if (cut <= 0) return [truncate(text, chars)]
  return [text.slice(0, cut), truncate(text.slice(cut + 1), chars)]
}

/** Places the columns, period names, points and spread labels of `items` (from slopeItems) in a frame. */
export function layoutSlope(items: readonly SlopeItem[], { width, height, mobile }: Size & { readonly mobile: boolean },
  startLabel: string, endLabel: string): SlopeLayout {
  const font = mobile ? 11 : 12
  const [line, lead, sans, mono] = [font + 4, mobile ? 16 : 20, font * SANS_EM, font * MONO_EM]
  const widest = (text: (item: SlopeItem) => string) => Math.max(0, ...items.map((item) => text(item).length))
  // The right column holds the end values and, when any rank moved, a glyph and the move after them.
  const moves = widest((item) => moveText(item.rank.move))
  const right = mono * widest((item) => item.endText) + (moves > 0 ? RANK_GAP + mono * (moves + 1) : 0)
  const [values, names] = [mono * widest((item) => item.startText), sans * widest((item) => item.label)]
  const room = width - right - lead * 2 - Math.max(MIN_PLOT, width * PLOT_SHARE)
  const startValues = room - values - NAME_GAP >= Math.min(names, sans * MIN_NAME_CHARS)
  const nameEnd = startValues ? values + NAME_GAP : 0
  const nameWidth = Math.max(sans * 4, Math.min(names, NAME_MAX, room - nameEnd))
  const left = nameWidth + nameEnd
  const plot = clamp(width - left - right - lead * 2, 0, MAX_PLOT)
  // A frame wider than the chart needs centres it, so the slopes never flatten across a wide panel.
  const x0 = Math.max(0, (width - left - right - lead * 2 - plot) / 2) + left + lead
  const x1 = x0 + plot
  const middle = (x0 + x1) / 2
  const fit = (span: number) => Math.max(4, Math.floor(span / sans))
  const wrapped = [wrapLabel(startLabel, fit(middle - HEADER_GAP / 2)), wrapLabel(endLabel, fit(width - middle - HEADER_GAP / 2))]
  const rows = Math.max(...wrapped.map((lines) => lines.length))
  const header = (lines: readonly string[], axis: number, from: number, to: number): SlopeHeader => {
    const half = (Math.max(...lines.map((text) => text.length)) * sans) / 2
    return { x: clamp(axis, from + half, to - half), lines: lines.map((text, index) => ({ text, y: (rows - lines.length + index + 1) * line - 4 })) }
  }
  const headers = [header(wrapped[0], x0, 0, middle - HEADER_GAP / 2), header(wrapped[1], x1, middle + HEADER_GAP / 2, width)] as const
  const top = rows * line + HEADER_PAD + line / 2
  const bottom = Math.max(top, height - line / 2 - EDGE)
  const all = items.flatMap((item) => [item.start, item.end])
  const scale = linearScale([Math.min(...all), Math.max(...all)], [bottom, top], { nice: false })
  const band = { size: line, gap: LABEL_GAP, top: top - line / 2, bottom: bottom + line / 2 }
  const spread = (side: 'start' | 'end') => new Map(
    spreadLabels(items.map((item) => ({ key: item.key, y: scale(item[side]) })), band).map((label) => [label.key, label.labelY]),
  )
  const [starts, ends] = [spread('start'), spread('end')]
  const chars = Math.floor(nameWidth / sans + EPSILON)
  const points = items.map((item) => {
    const [y0, y1] = [scale(item.start), scale(item.end)]
    return { ...item, name: truncate(item.label, chars), y0, y1, label0: starts.get(item.key) ?? y0, label1: ends.get(item.key) ?? y1 }
  })
  return { points, x0, x1, top, bottom, startValues, nameEnd, font, line, lead, headers }
}

/** Frame height for `count` items: room per item for its slope, under one or two header lines. */
export function slopeHeight(count: number, mobile: boolean): number {
  const rows = Math.max(5, count)
  return mobile ? 44 + rows * 26 : 48 + rows * 34
}

/** The item a pointer reads: beside an axis, the nearest label on that side; over the plot, the nearest line at its x. */
export function pickPoint(layout: SlopeLayout, x: number, y: number): SlopePoint | undefined {
  const t = clamp((x - layout.x0) / Math.max(1, layout.x1 - layout.x0), 0, 1)
  const gap = (point: SlopePoint) => {
    if (x < layout.x0 - layout.lead / 2) return Math.abs(point.label0 - y)
    if (x > layout.x1 + layout.lead / 2) return Math.abs(point.label1 - y)
    return Math.abs(point.y0 + (point.y1 - point.y0) * t - y)
  }
  return layout.points.reduce<SlopePoint | undefined>((best, point) => (best && gap(best) <= gap(point) ? best : point), undefined)
}

/** Where a key moves the reading in a list of `count`: arrows step and stop at the ends, Home and End jump; null for other keys. */
export function stepIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const step = STEPS[key]
  if (step === undefined) return null
  if (index < 0) return step > 0 ? 0 : count - 1
  return clamp(index + step, 0, count - 1)
}

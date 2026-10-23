/**
 * Pure helpers behind Treemap: the tiles one view draws, their tinted paint, the labels that fit them and
 * the words that describe them. Opening a category maps its rect onto the plot, so its siblings slide out
 * past the edges while its children, laid out in the whole plot, start as a scaled copy inside it.
 */

import { formatPercent } from '@/lib/formatters'

import { staggerDelay } from './chartMotion'
import { rankByValue, squarify, type TreemapNodeInput, type TreemapRect } from './treemapLayout'

/** A category: its colour paints its tile, and tints of that colour paint its children. */
export interface TreemapNode extends TreemapNodeInput {
  readonly color: string
}

/** Where a tile sits: the amount its share is of, and the opened category's name (null at the top). */
export interface TreemapLevel {
  readonly base: number
  readonly parent: string | null
}

/** One tile as a view draws it, in frame px before the gap inset. */
export interface TileView {
  /** Unique across both levels. */
  readonly key: string
  readonly node: TreemapNodeInput
  readonly color: string
  /** Share of the category colour in the fill, 0 to 1. */
  readonly strength: number
  readonly rect: TreemapRect
  /** Where the tile enters from and leaves to: its own centre, or for a child its spot inside the parent. */
  readonly origin: TreemapRect
  /** False for the opened category, which its children cover. */
  readonly shown: boolean
  /** In the level being browsed: takes pointer input and shows its label. */
  readonly live: boolean
  /** Entrance delay, from its rank in its level. */
  readonly delay: number
}

export interface TileLabel {
  readonly name: string
  readonly value?: string
}

/**
 * Fill strengths, as the share of the category colour mixed into the card. 0.46 is the strongest that keeps
 * foreground text at 4.5:1 on the brightest hue (yellow on the dark card), so every tile takes the same ink.
 */
const MAX_TINT = 0.46
const CATEGORY_TINT = 0.4
const FAINTEST_CHILD = 0.16
const ACTIVE_LIFT = 0.06
const KEY_JOIN = '\u001f'

const TEXT = { phone: { font: 11, line: 14, pad: 6 }, wide: { font: 12, line: 16, pad: 8 } } as const
/** Width per character in ems; names and tabular digits run wider than average, so these err long. */
const NAME_EM = 0.6
const DIGIT_EM = 0.62
const MIN_CHARS = 5

export const tileText = (mobile: boolean) => (mobile ? TEXT.phone : TEXT.wide)

/** A zero-size rect at `rect`'s centre, where a tile grows from. */
export const collapse = (rect: TreemapRect): TreemapRect => ({
  x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: 0, height: 0,
})

/** `rect` carried by the affine map that takes box `from` onto box `to`. */
export function mapRect(rect: TreemapRect, from: TreemapRect, to: TreemapRect): TreemapRect {
  const sx = to.width / from.width
  const sy = to.height / from.height
  return { x: to.x + (rect.x - from.x) * sx, y: to.y + (rect.y - from.y) * sy, width: rect.width * sx, height: rect.height * sy }
}

/** Whether a category has anything to zoom into. */
export const canOpen = (node: TreemapNodeInput): boolean => rankByValue(node.children ?? []).length > 0

/** Every tile of a view: the categories (pushed out past the plot when one is open), then the open one's children. */
export function treemapView(nodes: readonly TreemapNode[], openId: string | null, box: TreemapRect): TileView[] {
  const cells = squarify(nodes, box)
  const open = cells.find((cell) => cell.node.id === openId && canOpen(cell.node))
  const tiles = cells.map((cell, rank): TileView => {
    const rect = open ? mapRect(cell, open, box) : cell
    return {
      key: cell.node.id, node: cell.node, color: cell.node.color, strength: CATEGORY_TINT, rect, origin: collapse(rect),
      shown: cell !== open, live: open === undefined, delay: staggerDelay(rank, cells.length),
    }
  })
  if (!open) return tiles
  const children = squarify(open.node.children ?? [], box)
  return tiles.concat(children.map((child, rank): TileView => ({
    key: `${open.node.id}${KEY_JOIN}${child.node.id}`, node: child.node, color: open.node.color,
    strength: childTint(rank, children.length), rect: child, origin: mapRect(child, box, open),
    shown: true, live: true, delay: staggerDelay(rank, children.length),
  })))
}

/** Children fade from the strongest tint (the largest) to the faintest (the smallest). */
function childTint(rank: number, count: number): number {
  return count > 1 ? MAX_TINT - ((MAX_TINT - FAINTEST_CHILD) * rank) / (count - 1) : MAX_TINT
}

/** Fill and edge; the active tile (hovered, tapped or arrowed to) deepens and takes a full-colour edge. */
export function tilePaint(color: string, strength: number, active: boolean) {
  const share = Math.round(Math.min(MAX_TINT, active ? strength + ACTIVE_LIFT : strength) * 100)
  return {
    fill: `color-mix(in srgb, ${color} ${share}%, var(--color-card))`,
    stroke: active ? color : `color-mix(in srgb, ${color} 55%, transparent)`,
  }
}

/** Name and value when both fit; else the name alone, cut short if it must be; else nothing. */
export function fitLabel(name: string, value: string, width: number, height: number, mobile: boolean): TileLabel | null {
  const { font, line, pad } = tileText(mobile)
  const room = width - pad * 2
  const rows = Math.floor((height - pad * 2) / line)
  const chars = Math.floor(room / (font * NAME_EM))
  if (rows < 1 || chars < Math.min(MIN_CHARS, name.length)) return null
  const shown = name.length <= chars ? name : `${name.slice(0, chars - 1).trimEnd()}…`
  // The amount is never cut: a clipped figure misreads, so it shows whole or not at all.
  return rows >= 2 && value.length * font * DIGIT_EM <= room ? { name: shown, value } : { name: shown }
}

/** "23.4% of total", or of the opened category. */
export function shareOf(value: number, level: TreemapLevel): string {
  const share = level.base > 0 ? (value / level.base) * 100 : 0
  return `${formatPercent(share)} of ${level.parent ?? 'total'}`
}

/** What the live region says about a tile: its name, amount and share of its level. */
export function describeTile(node: TreemapNodeInput, level: TreemapLevel, formatValue: (value: number) => string): string {
  return `${node.label}: ${formatValue(node.value)}, ${shareOf(node.value, level)}`
}

export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

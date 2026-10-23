/**
 * Pure squarified treemap layout for the chart kit; no DOM, no dependencies. Follows Bruls, Huizing and
 * van Wijk (2000): items, largest first, join a row along the free rect's shorter side while that keeps
 * the row's worst aspect ratio falling; then the row is fixed and the rest of the rect is filled the same
 * way. Two levels: categories in the box, then each category's children inside its rect.
 */

export interface TreemapRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** A node of the two-level hierarchy. Only positive, finite values get a tile. */
export interface TreemapNodeInput {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly children?: readonly TreemapNodeInput[]
}

/** An item and the rect it was given. */
export interface TreemapTile<T> extends TreemapRect {
  readonly node: T
}

/** A top-level tile with its children laid out inside it. */
export interface TreemapCell<N extends TreemapNodeInput> extends TreemapTile<N> {
  readonly children: readonly TreemapTile<TreemapNodeInput>[]
}

interface Valued {
  readonly value: number
}

/** Positive, finite items, largest first; equal values keep their input order, so the layout is deterministic. */
export function rankByValue<T extends Valued>(items: readonly T[]): T[] {
  return items
    .map((item, order) => ({ item, order }))
    .filter(({ item }) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.item.value - a.item.value || a.order - b.order)
    .map(({ item }) => item)
}

/** One level of squarified tiles, largest first, covering the box exactly. A box without area gets none. */
export function squarify<T extends Valued>(items: readonly T[], box: TreemapRect): TreemapTile<T>[] {
  const ranked = rankByValue(items)
  if (ranked.length === 0 || !(box.width > 0 && box.height > 0)) return []
  const scale = (box.width * box.height) / ranked.reduce((sum, item) => sum + item.value, 0) // px² per unit
  const tiles: TreemapTile<T>[] = []
  let free: TreemapRect = box
  let row: T[] = []
  for (const item of ranked) {
    const side = Math.min(free.width, free.height)
    if (row.length > 0 && worstRatio([...row, item], side, scale) > worstRatio(row, side, scale)) {
      free = placeRow(row, free, scale, tiles, false)
      row = []
    }
    row.push(item)
  }
  placeRow(row, free, scale, tiles, true)
  return tiles
}

/** Categories squarified in the box, each with its children squarified inside its own rect. */
export function layoutTreemap<N extends TreemapNodeInput>(nodes: readonly N[], box: TreemapRect): TreemapCell<N>[] {
  return squarify(nodes, box).map((tile) => ({ ...tile, children: squarify(tile.node.children ?? [], tile) }))
}

/** The worst aspect ratio among a row of items laid along a side of length `side` (Bruls' `worst`). */
function worstRatio(row: readonly Valued[], side: number, scale: number): number {
  const areas = row.map((item) => item.value * scale)
  const sum = areas.reduce((total, area) => total + area, 0)
  const [squaredSum, squaredSide] = [sum * sum, side * side]
  return Math.max((squaredSide * Math.max(...areas)) / squaredSum, squaredSum / (squaredSide * Math.min(...areas)))
}

/**
 * Lays a row along the free rect's shorter side (a column at the left of a wide rect, a strip across the
 * top of a tall one) and returns what is left. The last item, and the last row, take the exact remainder,
 * so floating-point drift never leaves a sliver uncovered.
 */
function placeRow<T extends Valued>(row: readonly T[], free: TreemapRect, scale: number, out: TreemapTile<T>[], last: boolean) {
  const wide = free.width >= free.height
  const [across, along] = wide ? [free.width, free.height] : [free.height, free.width]
  const area = row.reduce((sum, item) => sum + item.value * scale, 0)
  const thickness = last ? across : area / along
  let offset = 0
  row.forEach((item, index) => {
    const length = index === row.length - 1 ? along - offset : (item.value * scale) / thickness
    out.push(wide
      ? { node: item, x: free.x, y: free.y + offset, width: thickness, height: length }
      : { node: item, x: free.x + offset, y: free.y, width: length, height: thickness })
    offset += length
  })
  return wide
    ? { x: free.x + thickness, y: free.y, width: free.width - thickness, height: free.height }
    : { x: free.x, y: free.y + thickness, width: free.width, height: free.height - thickness }
}

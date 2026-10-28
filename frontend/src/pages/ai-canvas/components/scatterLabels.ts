/**
 * Which scatter points get a name on the plot: outliers first (farthest from
 * the median point), each only where its label overlaps no label already
 * placed. Points sharing a value (twelve months of the same salary) would
 * otherwise stack their names into one unreadable block; every point keeps its
 * hover text and its row in the table.
 */

export interface PlacedPoint {
  readonly index: number
  readonly x: number
  readonly y: number
  readonly name: string
}

interface Box {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

const CHAR_EM = 0.62
const GAP = 4

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

/** The indexes to name, given each point's pixel position, its label, the font size and the dot radius. */
export function namedPoints(points: readonly PlacedPoint[], font: number, dot: number, width: number): Set<number> {
  const mx = median(points.map((point) => point.x))
  const my = median(points.map((point) => point.y))
  const byDistance = [...points].sort((a, b) => Math.hypot(b.x - mx, b.y - my) - Math.hypot(a.x - mx, a.y - my))
  const placed: Box[] = []
  const named = new Set<number>()
  for (const point of byDistance) {
    const textWidth = Math.min(point.name.length, 16) * font * CHAR_EM
    // Right of the dot, or left of it when it would run off the plot.
    const right = point.x + dot + GAP + textWidth <= width
    const left = right ? point.x + dot + GAP : point.x - dot - GAP - textWidth
    const box = { left, right: left + textWidth, top: point.y - font / 2 - 1, bottom: point.y + font / 2 + 1 }
    const dots = points.map((other) => ({
      left: other.x - dot,
      right: other.x + dot,
      top: other.y - dot,
      bottom: other.y + dot,
    }))
    if (placed.some((other) => overlaps(box, other)) || dots.some((other, i) => i !== point.index && overlaps(box, other))) {
      continue
    }
    placed.push(box)
    named.add(point.index)
  }
  return named
}

/** Where a named point's label starts, matching namedPoints' choice of side. */
export function labelX(point: PlacedPoint, font: number, dot: number, width: number): { x: number; anchor: 'start' | 'end' } {
  const textWidth = Math.min(point.name.length, 16) * font * CHAR_EM
  return point.x + dot + GAP + textWidth <= width
    ? { x: point.x + dot + GAP, anchor: 'start' }
    : { x: point.x - dot - GAP, anchor: 'end' }
}

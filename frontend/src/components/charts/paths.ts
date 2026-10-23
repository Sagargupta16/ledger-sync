/**
 * SVG path builders for the chart kit: lines and areas with linear,
 * monotone or step curves, pie/donut arcs, and bars with rounded corners.
 * Every builder returns a `d` string; nothing here touches the DOM.
 */

export type Curve = 'linear' | 'monotone' | 'step'

export interface Point {
  x: number
  y: number
}

const fmt = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : 0)

const sign = (value: number) => (value < 0 ? -1 : 1)

/** Tangent at the middle point of three, as in d3's curveMonotoneX (Steffen 1990). */
function interiorSlope(p0: Point, p1: Point, p2: Point): number {
  const h0 = p1.x - p0.x
  const h1 = p2.x - p1.x
  const s0 = h0 ? (p1.y - p0.y) / h0 : 0
  const s1 = h1 ? (p2.y - p1.y) / h1 : 0
  const p = h0 + h1 ? (s0 * h1 + s1 * h0) / (h0 + h1) : 0
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0
}

/** One-sided tangent at an end point, given its neighbour's tangent. */
function endSlope(p0: Point, p1: Point, tangent: number): number {
  const h = p1.x - p0.x
  return h ? (3 * (p1.y - p0.y) / h - tangent) / 2 : tangent
}

/** Path commands after the opening point; the caller supplies the `M` or `L`. */
function segments(points: readonly Point[], curve: Curve): string {
  if (points.length < 2) return ''
  if (curve === 'linear') return points.slice(1).map((p) => `L${fmt(p.x)},${fmt(p.y)}`).join('')
  if (curve === 'step') {
    return points.slice(1).map((p, index) => {
      const mid = (points[index].x + p.x) / 2
      return `H${fmt(mid)}V${fmt(p.y)}H${fmt(p.x)}`
    }).join('')
  }
  const n = points.length
  if (n === 2) return `L${fmt(points[1].x)},${fmt(points[1].y)}`
  const tangents = points.map((point, index) =>
    index > 0 && index < n - 1 ? interiorSlope(points[index - 1], point, points[index + 1]) : 0,
  )
  tangents[0] = endSlope(points[0], points[1], tangents[1])
  tangents[n - 1] = endSlope(points[n - 1], points[n - 2], tangents[n - 2])
  let d = ''
  for (let index = 1; index < n; index++) {
    const a = points[index - 1]
    const b = points[index]
    const dx = (b.x - a.x) / 3
    d += `C${fmt(a.x + dx)},${fmt(a.y + dx * tangents[index - 1])},${fmt(b.x - dx)},${fmt(b.y - dx * tangents[index])},${fmt(b.x)},${fmt(b.y)}`
  }
  return d
}

export function linePath(points: readonly Point[], curve: Curve = 'monotone'): string {
  if (points.length === 0) return ''
  const [first] = points
  return `M${fmt(first.x)},${fmt(first.y)}${segments(points, curve)}`
}

/** A closed band between `top` and `bottom`, which share x positions. */
export function areaPath(
  top: readonly Point[],
  bottom: readonly Point[],
  curve: Curve = 'monotone',
): string {
  if (top.length === 0) return ''
  const back = [...bottom].reverse()
  const [start] = back
  return `${linePath(top, curve)}L${fmt(start.x)},${fmt(start.y)}${segments(back, curve)}Z`
}

export interface ArcOptions {
  cx: number
  cy: number
  innerRadius: number
  outerRadius: number
  /** Radians clockwise from 12 o'clock. */
  startAngle: number
  endAngle: number
  /** Gap between neighbouring slices, in radians. */
  padAngle?: number
}

const polar = (cx: number, cy: number, radius: number, angle: number) =>
  `${fmt(cx + radius * Math.sin(angle))},${fmt(cy - radius * Math.cos(angle))}`

export function arcPath({ cx, cy, innerRadius, outerRadius, startAngle, endAngle, padAngle = 0 }: ArcOptions): string {
  const sweep = endAngle - startAngle
  if (sweep <= 0 || outerRadius <= 0) return ''
  if (sweep >= Math.PI * 2 - 1e-6) {
    // A full ring cannot be one arc command; draw two halves, inner reversed.
    const outer = `M${polar(cx, cy, outerRadius, 0)}A${fmt(outerRadius)},${fmt(outerRadius)} 0 1 1 ${polar(cx, cy, outerRadius, Math.PI)}A${fmt(outerRadius)},${fmt(outerRadius)} 0 1 1 ${polar(cx, cy, outerRadius, 0)}Z`
    if (innerRadius <= 0) return outer
    return `${outer}M${polar(cx, cy, innerRadius, 0)}A${fmt(innerRadius)},${fmt(innerRadius)} 0 1 0 ${polar(cx, cy, innerRadius, Math.PI)}A${fmt(innerRadius)},${fmt(innerRadius)} 0 1 0 ${polar(cx, cy, innerRadius, 0)}Z`
  }
  const pad = Math.min(padAngle, sweep * 0.5) / 2
  const a0 = startAngle + pad
  const a1 = endAngle - pad
  const large = a1 - a0 > Math.PI ? 1 : 0
  const outer = `M${polar(cx, cy, outerRadius, a0)}A${fmt(outerRadius)},${fmt(outerRadius)} 0 ${large} 1 ${polar(cx, cy, outerRadius, a1)}`
  if (innerRadius <= 0) return `${outer}L${fmt(cx)},${fmt(cy)}Z`
  return `${outer}L${polar(cx, cy, innerRadius, a1)}A${fmt(innerRadius)},${fmt(innerRadius)} 0 ${large} 0 ${polar(cx, cy, innerRadius, a0)}Z`
}

/** Corner radii clockwise from top-left, the order of `BAR_RADIUS`. */
export type CornerRadii = readonly [number, number, number, number]

/** A clockwise corner arc of `radius` ending at (x, y); nothing for a square corner. */
const corner = (radius: number, x: number, y: number) =>
  radius ? `A${fmt(radius)},${fmt(radius)} 0 0 1 ${fmt(x)},${fmt(y)}` : ''

export function roundedRectPath(x: number, y: number, width: number, height: number, radii: CornerRadii): string {
  if (width <= 0 || height <= 0) return ''
  const limit = Math.min(width, height) / 2
  const [tl, tr, br, bl] = radii.map((radius) => Math.max(0, Math.min(radius, limit)))
  const r = x + width
  const b = y + height
  return `M${fmt(x + tl)},${fmt(y)}H${fmt(r - tr)}${corner(tr, r, y + tr)}`
    + `V${fmt(b - br)}${corner(br, r - br, b)}`
    + `H${fmt(x + bl)}${corner(bl, x, b - bl)}`
    + `V${fmt(y + tl)}${corner(tl, x + tl, y)}Z`
}

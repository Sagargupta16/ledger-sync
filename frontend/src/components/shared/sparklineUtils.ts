export const COMPACT_VIEWBOX_W = 100
export const COMPACT_VIEWBOX_H = 30

export interface SparkPoint {
  x: number
  y: number
}

export interface CompactGeometry {
  linePath: string
  areaPath: string
  last: SparkPoint
}

/**
 * Geometry for the compact-variant sparkline: evenly-spaced points across
 * a fixed viewbox, an SVG line path, a closed area path, and the last point
 * for the end dot. Returns null for series shorter than 2 samples.
 */
export function buildCompactGeometry(data: number[]): CompactGeometry | null {
  if (data.length < 2) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  // Flat series: avoid divide-by-zero, render a horizontal mid-line.
  const span = max - min === 0 ? 1 : max - min
  const stepX = COMPACT_VIEWBOX_W / (data.length - 1)

  const points = data.map((v, i) => {
    const x = i * stepX
    // Y inverted (SVG top-left origin); 2 px top + bottom padding.
    const y =
      COMPACT_VIEWBOX_H - 2 - ((v - min) / span) * (COMPACT_VIEWBOX_H - 4)
    return { x, y }
  })

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')
  const areaPath = `${linePath} L ${COMPACT_VIEWBOX_W} ${COMPACT_VIEWBOX_H} L 0 ${COMPACT_VIEWBOX_H} Z`

  const last = points[points.length - 1]

  return { linePath, areaPath, last }
}

export interface DefaultSparkPoint {
  x: number
  y: number
  value: number
}

export interface DefaultGeometry {
  linePath: string
  areaPath: string
  points: DefaultSparkPoint[]
  avgY: number
}

/**
 * Geometry for the default rich sparkline: smoothed cubic-bezier line path,
 * closed gradient-fill area path, the point list (with values for tooltips),
 * and the Y coordinate of the average reference line.
 */
export function buildDefaultGeometry(
  data: number[],
  width: number,
  height: number,
): DefaultGeometry {
  if (data.length < 2) return { linePath: '', areaPath: '', points: [], avgY: 0 }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const padding = 4

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = padding + ((max - v) / range) * (height - padding * 2)
    return { x, y, value: v }
  })

  let line = `M ${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const curr = pts[i]
    const cpx = (prev.x + curr.x) / 2
    line += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`
  }

  const last = pts.at(-1)
  if (!last) return { linePath: '', areaPath: '', points: [], avgY: 0 }
  const area = `${line} L ${last.x},${height} L ${pts[0].x},${height} Z`

  // Average value and its Y coordinate for the reference line
  const avg = data.reduce((sum, v) => sum + v, 0) / data.length
  const averageY = padding + ((max - avg) / range) * (height - padding * 2)

  return { linePath: line, areaPath: area, points: pts, avgY: averageY }
}

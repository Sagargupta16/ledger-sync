import { buildCompactGeometry, COMPACT_VIEWBOX_W, COMPACT_VIEWBOX_H } from './sparklineUtils'

/** Line and end-dot sizes in pixels: what the 100x30 grid drew at the default 80x24. */
const STROKE_WIDTH = 1.2
const DOT_RADIUS = 1.3

/**
 * Compact-variant sparkline: pure SVG, no chart-lib overhead, no
 * animation/hover. Mirrors the inline-list use case (category breakdown
 * rows, table cells). Falls back to the rich animated form when
 * variant is omitted or 'default'.
 */
export default function CompactSparkline({
  data,
  color,
  width,
  height,
  ariaLabel,
}: Readonly<{
  data: number[]
  color: string
  width: number
  height: number
  ariaLabel?: string
}>) {
  const geometry = buildCompactGeometry(data)
  if (!geometry) return null

  const { linePath, areaPath, last } = geometry
  // The geometry is laid out on a fixed 100x30 grid. Only the paths are scaled
  // to the real box: the stroke does not scale and the dot is placed in pixels,
  // so neither stretches when width and height leave the grid's aspect ratio.
  const scaleX = width / COMPACT_VIEWBOX_W
  const scaleY = height / COMPACT_VIEWBOX_H

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel ?? 'Trend'}
      className="shrink-0 overflow-visible"
    >
      <g transform={`scale(${scaleX} ${scaleY})`}>
        <path d={areaPath} fill={color} fillOpacity={0.15} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
      <circle cx={last.x * scaleX} cy={last.y * scaleY} r={DOT_RADIUS} fill={color} />
    </svg>
  )
}

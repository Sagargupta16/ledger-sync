import { buildCompactGeometry, COMPACT_VIEWBOX_W, COMPACT_VIEWBOX_H } from './sparklineUtils'

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

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${COMPACT_VIEWBOX_W} ${COMPACT_VIEWBOX_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? 'Trend'}
      className="shrink-0 overflow-visible"
    >
      <path d={areaPath} fill={color} fillOpacity={0.15} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={1.6} fill={color} />
    </svg>
  )
}

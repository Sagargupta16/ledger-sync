/**
 * Tiny inline 12-month spending sparkline.
 *
 * Pure SVG, no chart library dependency. Used in the category breakdown
 * list to show "is this category trending up or down?" alongside the
 * "what % of total spend" proportional bar.
 *
 * The component normalizes its input to the SVG viewbox internally so
 * callers just pass a series of monthly amounts (oldest -> newest).
 * Renders nothing when there are fewer than 2 data points.
 */
interface CategorySparklineProps {
  readonly values: readonly number[]
  readonly color: string
  readonly width?: number
  readonly height?: number
  readonly ariaLabel?: string
}

const VIEWBOX_W = 100
const VIEWBOX_H = 30

export function CategorySparkline({
  values,
  color,
  width = 80,
  height = 24,
  ariaLabel,
}: CategorySparklineProps) {
  if (values.length < 2) return null

  const max = Math.max(...values)
  const min = Math.min(...values)
  // Avoid divide-by-zero when the category is flat across the window:
  // render a horizontal mid-line in that case.
  const span = max - min === 0 ? 1 : max - min

  const stepX = VIEWBOX_W / (values.length - 1)

  const points = values.map((v, i) => {
    const x = i * stepX
    // Y is inverted (SVG origin top-left); leave 2px top + bottom padding.
    const y = VIEWBOX_H - 2 - ((v - min) / span) * (VIEWBOX_H - 4)
    return { x, y }
  })

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')

  // Closed path under the line for the soft fill.
  const areaPath =
    `${linePath} L ${VIEWBOX_W} ${VIEWBOX_H} L 0 ${VIEWBOX_H} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? '12-month trend'}
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
      {/* Highlight the latest point so the eye lands on "today". */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={1.6}
        fill={color}
      />
    </svg>
  )
}

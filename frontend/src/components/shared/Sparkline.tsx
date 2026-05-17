import { useEffect, useMemo, useState, useCallback } from 'react'

import { motion, useMotionValue, useTransform, animate } from 'framer-motion'

import { rawColors } from '@/constants/colors'
import { formatCurrencyShort } from '@/lib/formatters'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  showTooltip?: boolean
  /**
   * Compact variant: no animation, no hover, soft area fill, dot on the
   * latest point. Used for inline trend indicators in dense lists like
   * the category breakdown rows. Default variant retains the rich,
   * animated, hoverable form for cards/dashboards.
   */
  variant?: 'default' | 'compact'
  /** Width override -- only respected by the compact variant. */
  width?: number
  /** Optional aria-label. Compact callsites should always provide one. */
  ariaLabel?: string
}

const COMPACT_VIEWBOX_W = 100
const COMPACT_VIEWBOX_H = 30

/**
 * Compact-variant sparkline: pure SVG, no chart-lib overhead, no
 * animation/hover. Mirrors the inline-list use case (category breakdown
 * rows, table cells). Falls back to the rich animated form when
 * variant is omitted or 'default'.
 */
function CompactSparkline({
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

/**
 * Sparkline with animated SVG path, hover tooltip, and end-dot indicator.
 *
 * Pass ``variant="compact"`` for inline-list use cases (category rows,
 * table cells) -- a stripped-down static form with no animation/hover.
 */
export default function Sparkline({
  data,
  color = rawColors.app.purple,
  height = 48,
  showTooltip = true,
  variant = 'default',
  width: compactWidth = 80,
  ariaLabel,
}: Readonly<SparklineProps>) {
  if (variant === 'compact') {
    return (
      <CompactSparkline
        data={data}
        color={color}
        width={compactWidth}
        height={height === 48 ? 24 : height}
        ariaLabel={ariaLabel}
      />
    )
  }
  return (
    <DefaultSparkline
      data={data}
      color={color}
      height={height}
      showTooltip={showTooltip}
    />
  )
}

/**
 * Default rich sparkline -- animated path, hover tooltip, gradient fill,
 * average reference line, glow on the active dot. Used in cards and
 * dashboards. Hooks live in this dedicated component so the exported
 * dispatcher above doesn't violate rules-of-hooks.
 */
function DefaultSparkline({
  data,
  color,
  height,
  showTooltip,
}: Readonly<{
  data: number[]
  color: string
  height: number
  showTooltip: boolean
}>) {
  const width = 200
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const { linePath, areaPath, points, avgY } = useMemo(() => {
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
  }, [data, height])

  const progress = useMotionValue(0)

  useEffect(() => {
    if (linePath) {
      progress.set(0)
      const ctrl = animate(progress, 1, { duration: 1, ease: [0.25, 0.46, 0.45, 0.94] })
      return () => ctrl.stop()
    }
    progress.set(1)
  }, [linePath, progress])

  const dashOffset = useTransform(progress, [0, 1], [1, 0])
  const areaOpacity = useTransform(progress, [0.3, 1], [0, 0.15])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!showTooltip || points.length === 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      const xRatio = (e.clientX - rect.left) / rect.width
      const idx = Math.round(xRatio * (points.length - 1))
      setHoverIndex(Math.max(0, Math.min(idx, points.length - 1)))
    },
    [showTooltip, points],
  )

  const handleMouseLeave = useCallback(() => setHoverIndex(null), [])

  if (data.length < 2 || !linePath) return null

  const lastPoint = points.at(-1)
  if (!lastPoint) return null
  const hoverPoint = hoverIndex === null ? null : points[hoverIndex]
  const colorKey = color.replace('#', '')
  const gradId = `spark-grad-${colorKey}`
  const glowId = `spark-glow-${colorKey}`

  return (
    <div className="relative group">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full cursor-crosshair"
        style={{ height }}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          {/* Glow filter for active hover dot */}
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={3} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Gradient fill */}
        <motion.path d={areaPath} fill={`url(#${gradId})`} style={{ opacity: areaOpacity }} />

        {/* Average reference line */}
        <line
          x1={0}
          y1={avgY}
          x2={width}
          y2={avgY}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Line */}
        <motion.path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{ pathLength: dashOffset }}
          strokeDasharray="1"
          strokeDashoffset="0"
        />

        {/* End dot */}
        <circle cx={lastPoint.x} cy={lastPoint.y} r={3} fill={color} />

        {/* Hover crosshair + glowing active dot */}
        {hoverPoint && (
          <>
            <line
              x1={hoverPoint.x}
              y1={0}
              x2={hoverPoint.x}
              y2={height}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {/* Outer glow ring */}
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r={6}
              fill={color}
              opacity={0.25}
              filter={`url(#${glowId})`}
            />
            {/* Inner dot */}
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r={4}
              fill={color}
              stroke="rgba(0,0,0,0.6)"
              strokeWidth={1.5}
            />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {showTooltip && hoverPoint && (
        <div
          className="absolute -top-8 px-2 py-1 bg-surface-tooltip text-white text-caption font-medium rounded shadow-lg pointer-events-none whitespace-nowrap border border-border"
          style={{
            left: `${(hoverPoint.x / width) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {formatCurrencyShort(hoverPoint.value)}
        </div>
      )}
    </div>
  )
}

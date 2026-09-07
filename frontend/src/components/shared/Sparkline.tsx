import { useMemo, useState, useCallback } from 'react'

import { motion } from 'motion/react'

import { rawColors } from '@/constants/colors'
import { formatCurrencyShort } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

import CompactSparkline from './SparklineCompact'
import { buildDefaultGeometry } from './sparklineUtils'

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
  /** Optional hover title (native tooltip) for extra context. */
  title?: string
}

/**
 * Sparkline with an opacity reveal, hover tooltip, and end-dot indicator.
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
  title,
}: Readonly<SparklineProps>) {
  if (variant === 'compact') {
    const compact = (
      <CompactSparkline
        data={data}
        color={color}
        width={compactWidth}
        height={height === 48 ? 24 : height}
        ariaLabel={ariaLabel}
      />
    )
    // Wrap in a titled span so callers can add a native tooltip without
    // CompactSparkline needing a title prop of its own.
    return title ? <span title={title} className="inline-flex">{compact}</span> : compact
  }
  return (
    <DefaultSparkline
      data={data}
      color={color}
      height={height}
      showTooltip={showTooltip}
      ariaLabel={ariaLabel}
    />
  )
}

/**
 * Default rich sparkline -- opacity entrance, hover tooltip, area fill,
 * average reference line, and an active-point ring. Used in cards and
 * dashboards. Hooks live in this dedicated component so the exported
 * dispatcher above doesn't violate rules-of-hooks.
 */
function DefaultSparkline({
  data,
  color,
  height,
  showTooltip,
  ariaLabel,
}: Readonly<{
  data: number[]
  color: string
  height: number
  showTooltip: boolean
  ariaLabel?: string
}>) {
  const width = 200
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')

  const { linePath, areaPath, points, avgY } = useMemo(
    () => buildDefaultGeometry(data, width, height),
    [data, height],
  )

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

  return (
    <div className="relative group">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full cursor-crosshair select-none"
        style={{ height }}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel ?? 'Trend'}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <motion.path
          d={areaPath}
          fill={color}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 0.12 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />

        {/* Average reference line */}
        <line
          x1={0}
          y1={avgY}
          x2={width}
          y2={avgY}
          stroke={rawColors.chart.svgStroke}
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
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />

        {/* End dot */}
        <circle cx={lastPoint.x} cy={lastPoint.y} r={3} fill={color} />

        {/* Hover crosshair + active-point ring */}
        {hoverPoint && (
          <>
            <line
              x1={hoverPoint.x}
              y1={0}
              x2={hoverPoint.x}
              y2={height}
              stroke={rawColors.chart.referenceLine}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r={6}
              fill="none"
              stroke={color}
              strokeOpacity={0.4}
              strokeWidth={2}
            />
            {/* Inner dot -- ring matches the page background so the dot reads
                as cut out in BOTH themes (was a hardcoded black ring that
                disappeared into dark cards and smudged on light ones). */}
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r={4}
              fill={color}
              stroke="var(--app-bg)"
              strokeWidth={1.5}
            />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {showTooltip && hoverPoint && (
        <div
          className="absolute -top-8 px-2 py-1 bg-surface-tooltip text-foreground text-caption font-medium rounded shadow-lg pointer-events-none whitespace-nowrap border border-border"
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

import { useCallback, useId, useMemo, useRef, useState } from 'react'

import { motion, useInView } from 'motion/react'

import { CHART_EASE, CHART_MOTION } from '@/components/charts/chartMotion'
import { useElementSize } from '@/components/charts/useElementSize'
import { usePrinting } from '@/components/charts/usePrinting'
import { rawColors } from '@/constants/colors'
import { formatCurrencyShort } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

import CompactSparkline from './SparklineCompact'
import { buildDefaultGeometry } from './sparklineUtils'

const HAS_OBSERVER = typeof IntersectionObserver !== 'undefined'
const NO_ELEMENT = { current: null }
/** Left-to-right wipe that reveals the fill, the average rule and the line. */
const WIPE = { duration: 0.6, ease: CHART_EASE }
/** The eased wipe reaches the right edge about halfway through: the end dot pops in as the line lands. */
const POP = {
  type: 'spring',
  visualDuration: CHART_MOTION.hover,
  bounce: 0.4,
  delay: WIPE.duration * 0.5,
} as const
/** Clip overhang, so the round caps at either end of the stroke are never shaved. */
const CLIP_PAD = 4

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
 * Sparkline with a left-to-right wipe, hover tooltip, and end-dot indicator.
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
  // Under two points is no trend. Checked here because the rich form measures
  // its box on mount, so it must mount with something to draw.
  if (data.length < 2) return null
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
 * Default rich sparkline -- left-to-right wipe on first view, hover and touch
 * tooltip, area fill, average reference line, and an active-point ring. Drawn
 * at its measured pixel width, so dots stay round and strokes even at any
 * width. Used in cards and dashboards. Hooks live in this dedicated component
 * so the exported dispatcher above doesn't violate rules-of-hooks.
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
  const ref = useRef<HTMLDivElement>(null)
  const { width } = useElementSize(ref)
  const clipId = `sparkline-wipe-${useId().replaceAll(/[^\w-]/g, '')}`
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const reduced = useMotionStore((state) => state.mode === 'reduced')
  const printing = usePrinting()
  // Motion's inView constructs an IntersectionObserver unguarded; jsdom has none.
  const inView = useInView(HAS_OBSERVER ? ref : NO_ELEMENT, { once: true, amount: 0.5 })
  const moving = !reduced && !printing
  const shown = !moving || inView || !HAS_OBSERVER

  const { linePath, areaPath, points, avgY } = useMemo(
    () => buildDefaultGeometry(data, width, height),
    [data, width, height],
  )

  // Mouse, pen and touch alike: a press reads the nearest point, a drag scrubs.
  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!showTooltip || points.length === 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      const xRatio = (e.clientX - rect.left) / rect.width
      const idx = Math.round(xRatio * (points.length - 1))
      setHoverIndex(Math.max(0, Math.min(idx, points.length - 1)))
    },
    [showTooltip, points],
  )

  // A mouse clears on leave; a lifted finger keeps its readout, as in the chart kit.
  const handlePointerLeave = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse') setHoverIndex(null)
  }, [])

  // The browser took the gesture over for scrolling; a pinned readout would go stale.
  const handlePointerCancel = useCallback(() => setHoverIndex(null), [])

  const lastPoint = width > 0 ? points.at(-1) : undefined
  const hoverPoint = hoverIndex === null ? null : points[hoverIndex]
  // A unit rect scaled over the box, so a resize rescales the clip instead of replaying it.
  const clipBox = `translate(${-CLIP_PAD} ${-CLIP_PAD}) scale(${width + CLIP_PAD * 2} ${height + CLIP_PAD * 2})`

  return (
    <div ref={ref} className="relative group">
      <svg
        className={`w-full overflow-visible cursor-crosshair select-none ${showTooltip ? 'touch-pan-y' : ''}`}
        style={{ height }}
        role="img"
        aria-label={ariaLabel ?? 'Trend'}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerCancel}
      >
        {lastPoint && (
          <>
            {moving && (
              <defs>
                <clipPath id={clipId}>
                  <motion.rect x={0} y={0} height={1} transform={clipBox}
                    initial={{ width: 0 }} animate={{ width: shown ? 1 : 0 }} transition={WIPE} />
                </clipPath>
              </defs>
            )}

            <g clipPath={moving ? `url(#${clipId})` : undefined}>
              <path d={areaPath} fill={color} fillOpacity={0.12} />
              {/* Average reference line */}
              <line x1={0} y1={avgY} x2={width} y2={avgY}
                stroke={rawColors.chart.svgStroke} strokeWidth={1} strokeDasharray="3 3" />
              {/* Line */}
              <path d={linePath} fill="none" stroke={color} strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" />
            </g>

            {/* End dot: pops in as the wipe reaches it */}
            <motion.circle cx={lastPoint.x} cy={lastPoint.y} r={3} fill={color}
              initial={moving ? { scale: 0 } : false} animate={{ scale: shown ? 1 : 0 }}
              transition={moving ? POP : { duration: 0 }} />

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
          </>
        )}
      </svg>

      {/* Tooltip */}
      {showTooltip && hoverPoint && (
        <div
          className="absolute -top-8 px-2 py-1 bg-surface-tooltip text-foreground text-caption font-medium rounded shadow-lg pointer-events-none whitespace-nowrap border border-border"
          style={{ left: hoverPoint.x, transform: 'translateX(-50%)' }}
        >
          {formatCurrencyShort(hoverPoint.value)}
        </div>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState, useCallback } from 'react'
import { rawColors } from '@/constants/colors'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { formatCurrencyShort } from '@/lib/formatters'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  showTooltip?: boolean
}

/**
 * Sparkline with animated SVG path, hover tooltip, and end-dot indicator.
 */
export default function Sparkline({
  data,
  color = rawColors.ios.purple,
  height = 48,
  showTooltip = true,
}: Readonly<SparklineProps>) {
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

    const last = pts.at(-1)!
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

  const lastPoint = points.at(-1)!
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

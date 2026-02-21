import { useEffect, useMemo } from 'react'
import { rawColors } from '@/constants/colors'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
}

/**
 * Sparkline with animated SVG path draw effect on mount.
 * Falls back to instant render when reduced motion is preferred.
 */
export default function Sparkline({ data, color = rawColors.ios.purple, height = 40 }: Readonly<SparklineProps>) {
  const reducedMotion = useReducedMotion()
  const width = 200 // SVG viewBox width — scales with container via CSS

  const { linePath, areaPath } = useMemo(() => {
    if (data.length < 2) return { linePath: '', areaPath: '' }

    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const padding = 2 // top/bottom padding in SVG units

    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = padding + ((max - v) / range) * (height - padding * 2)
      return { x, y }
    })

    // Build smooth cubic bezier path
    let line = `M ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cpx = (prev.x + curr.x) / 2
      line += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`
    }

    // Gradient fill area path (line + close to bottom)
    const last = points.at(-1)!
    const area = `${line} L ${last.x},${height} L ${points[0].x},${height} Z`

    return { linePath: line, areaPath: area }
  }, [data, height])

  const progress = useMotionValue(0)

  useEffect(() => {
    if (reducedMotion || !linePath) {
      progress.set(1)
      return
    }
    progress.set(0)
    const ctrl = animate(progress, 1, { duration: 1, ease: [0.25, 0.46, 0.45, 0.94] })
    return () => ctrl.stop()
  }, [linePath, reducedMotion, progress])

  const dashOffset = useTransform(progress, [0, 1], [1, 0])
  const areaOpacity = useTransform(progress, [0.3, 1], [0, 0.15])

  if (data.length < 2 || !linePath) return null

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`spark-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Gradient fill area */}
      <motion.path
        d={areaPath}
        fill={`url(#spark-grad-${color.replace('#', '')})`}
        style={{ opacity: areaOpacity }}
      />

      {/* Animated line draw */}
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
    </svg>
  )
}

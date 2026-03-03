import { motion, animate } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { metricColorConfig, rawColors, type MetricColor } from '@/constants/colors'

/** Animated number counter — extracts numeric part from formatted strings like "$1,234.56" */
function AnimatedValue({ value }: Readonly<{ value: string | number }>) {
  const ref = useRef<HTMLSpanElement>(null)
  const prevValue = useRef<string>(String(value))

  useEffect(() => {
    if (!ref.current) {
      prevValue.current = String(value)
      return
    }

    const str = String(value)
    // Extract the numeric portion (supports $1,234.56 / ₹12,345 / 99.5% etc.)
    const match = /[\d,.]+/.exec(str)
    if (!match) {
      ref.current.textContent = str
      prevValue.current = str
      return
    }

    const numericStr = match[0].replaceAll(',', '')
    const target = Number.parseFloat(numericStr)
    if (Number.isNaN(target)) {
      ref.current.textContent = str
      prevValue.current = str
      return
    }

    // Extract prefix (like "$" or "₹") and suffix (like "%")
    const prefix = str.slice(0, match.index)
    const suffix = str.slice((match.index ?? 0) + match[0].length)
    const hasDecimals = numericStr.includes('.')
    const decimalPlaces = hasDecimals ? (numericStr.split('.')[1]?.length ?? 0) : 0

    const motionVal = { v: 0 }
    const ctrl = animate(motionVal, { v: target }, {
      duration: 0.8,
      ease: [0.25, 0.46, 0.45, 0.94],
      onUpdate: () => {
        if (!ref.current) return
        const formatted = motionVal.v.toLocaleString(undefined, {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        })
        ref.current.textContent = `${prefix}${formatted}${suffix}`
      },
    })

    prevValue.current = str
    return () => ctrl.stop()
  }, [value])

  return <span ref={ref}>{String(value)}</span>
}

interface MetricCardProps {
  title: string
  value: string | number
  change?: number
  /** If true, a positive change is bad (e.g. expenses going up = red) */
  invertChange?: boolean
  /** Custom label after the percentage, e.g. "pts vs last month" */
  changeLabel?: string
  icon: LucideIcon
  color?: MetricColor
  isLoading?: boolean
  trend?: ReactNode
  /** Optional subtitle shown below the value (e.g. "Target: 30%") */
  subtitle?: string
}

export default function MetricCard({ title, value, change, invertChange, changeLabel, icon: Icon, color = 'blue', isLoading, trend, subtitle }: Readonly<MetricCardProps>) {
  const colors = metricColorConfig[color]

  if (isLoading) {
    return (
      <div className="p-6 glass rounded-2xl">
        <div className="h-4 bg-white/[0.06] animate-pulse rounded w-1/2 mb-4" />
        <div className="h-8 bg-white/[0.06] animate-pulse rounded w-3/4 mb-2" />
        <div className="h-3 bg-white/[0.06] animate-pulse rounded w-1/3" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative p-6 glass rounded-2xl transition-colors duration-150 ease-out hover:border-white/[0.08]"
    >
      {/* Icon */}
      <div
        className="inline-flex p-3 rounded-xl mb-4"
        style={{ background: colors.bg }}
      >
        <Icon className="w-6 h-6" style={{ color: colors.text }} />
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-zinc-400 mb-1">{title}</h3>

      {/* Animated Value */}
      <output className="flex items-baseline gap-2" aria-live="polite">
        <p className="text-2xl font-bold text-white">
          <AnimatedValue value={value} />
        </p>
      </output>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
      )}

      {/* Sparkline/Trend */}
      {trend && (
        <div className="mt-3 opacity-80">
          {trend}
        </div>
      )}

      {/* Change indicator */}
      {change !== undefined && (
        (() => {
          const isPositive = change >= 0
          const isGood = invertChange ? !isPositive : isPositive
          const goodColor = rawColors.ios.green
          const badColor = rawColors.ios.red
          return (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.3, ease: 'easeOut' }}
              className="flex items-center gap-2 mt-3"
            >
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${isGood ? 'bg-ios-green/10' : 'bg-ios-red/10'}`}>
                {isPositive ? (
                  <TrendingUp className="w-3.5 h-3.5" style={{ color: isGood ? goodColor : badColor }} />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" style={{ color: isGood ? goodColor : badColor }} />
                )}
                <span
                  className="text-sm font-medium"
                  style={{ color: isGood ? goodColor : badColor }}
                >
                  {change > 0 ? '+' : ''}{change}%
                </span>
              </span>
              <span className="text-xs text-zinc-500">
                {changeLabel || 'vs last month'}
              </span>
            </motion.div>
          )
        })()
      )}
    </motion.div>
  )
}

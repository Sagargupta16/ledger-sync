import { motion, animate } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { metricColorConfig, rawColors, type MetricColor } from '@/constants/colors'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cardHover } from '@/constants/animations'

/** Animated number counter — extracts numeric part from formatted strings like "$1,234.56" */
function AnimatedValue({ value, reducedMotion }: Readonly<{ value: string | number; reducedMotion: boolean }>) {
  const ref = useRef<HTMLSpanElement>(null)
  const prevValue = useRef<string>(String(value))

  useEffect(() => {
    if (reducedMotion || !ref.current) {
      if (ref.current) ref.current.textContent = String(value)
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
  }, [value, reducedMotion])

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
  const reducedMotion = useReducedMotion()

  if (isLoading) {
    return (
      <div className="p-6 glass rounded-2xl border border-white/5 border-t-white/10 border-l-white/10 shadow-xl shadow-black/40">
        <div className="h-4 skeleton w-1/2 mb-4" />
        <div className="h-8 skeleton w-3/4 mb-2" />
        <div className="h-3 skeleton w-1/3" />
      </div>
    )
  }

  const Wrapper = reducedMotion ? 'div' : motion.div

  return (
    <Wrapper
      {...(!reducedMotion && {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { type: 'spring', stiffness: 300, damping: 30 },
        whileHover: cardHover,
      })}
      className="relative p-6 glass rounded-2xl overflow-hidden group border border-white/5 border-t-white/10 border-l-white/10 shadow-xl shadow-black/40 transition-all duration-300 hover:border-white/[0.12] hover:shadow-2xl hover:shadow-black/50"
    >
      {/* Animated gradient glow on hover */}
      <div
        className="absolute top-0 right-0 w-40 h-40 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-50"
        style={{ background: colors.glow }}
      />
      <div
        className="absolute bottom-0 left-0 w-24 h-24 opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-30"
        style={{ background: colors.glow }}
      />

      {/* Icon with scale-in animation */}
      {reducedMotion ? (
        <div
          className="inline-flex p-3 rounded-2xl mb-4 relative z-10"
          style={{ background: colors.bg, boxShadow: `0 8px 24px ${colors.glow}` }}
        >
          <Icon className="w-6 h-6" style={{ color: colors.text }} />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 20 }}
          className="inline-flex p-3 rounded-2xl mb-4 relative z-10"
          style={{ background: colors.bg, boxShadow: `0 8px 24px ${colors.glow}` }}
        >
          <Icon className="w-6 h-6" style={{ color: colors.text }} />
        </motion.div>
      )}

      {/* Title */}
      <h3 className="text-sm font-medium mb-1 relative z-10" style={{ color: rawColors.text.secondary }}>{title}</h3>

      {/* Animated Value */}
      <div className="flex items-baseline gap-2 relative z-10">
        <p className="text-xl sm:text-2xl md:text-3xl font-semibold text-white">
          <AnimatedValue value={value} reducedMotion={reducedMotion} />
        </p>
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-xs mt-1 relative z-10" style={{ color: rawColors.text.tertiary }}>{subtitle}</p>
      )}

      {/* Sparkline/Trend */}
      {trend && (
        <div className="mt-3 relative z-10 opacity-80">
          {trend}
        </div>
      )}

      {/* Change indicator with entrance animation */}
      {change !== undefined && (
        (() => {
          const isPositive = change >= 0
          const isGood = invertChange ? !isPositive : isPositive
          const goodColor = rawColors.ios.green
          const badColor = rawColors.ios.red
          const ChangeWrapper = reducedMotion ? 'div' : motion.div
          return (
            <ChangeWrapper
              {...(!reducedMotion && {
                initial: { opacity: 0, x: -10 },
                animate: { opacity: 1, x: 0 },
                transition: { delay: 0.3, duration: 0.4 },
              })}
              className="flex items-center gap-1.5 mt-3 relative z-10"
            >
              {isPositive ? (
                <TrendingUp className="w-4 h-4" style={{ color: isGood ? goodColor : badColor }} />
              ) : (
                <TrendingDown className="w-4 h-4" style={{ color: isGood ? goodColor : badColor }} />
              )}
              <span
                className="text-sm font-medium"
                style={{ color: isGood ? goodColor : badColor }}
              >
                {change > 0 ? '+' : ''}{change}%
              </span>
              <span className="text-xs ml-1" style={{ color: rawColors.text.tertiary }}>
                {changeLabel || 'vs last month'}
              </span>
            </ChangeWrapper>
          )
        })()
      )}
    </Wrapper>
  )
}

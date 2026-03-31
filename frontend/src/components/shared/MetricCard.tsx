import { motion, animate } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { metricColorConfig, rawColors, type MetricColor } from '@/constants/colors'

/** Parse a formatted string like "$1,234.56" or "₹12,345" into parts */
function parseFormattedNumber(str: string) {
  const match = /[\d,.]+/.exec(str)
  if (!match) return null
  const numericStr = match[0].replaceAll(',', '')
  const target = Number.parseFloat(numericStr)
  if (Number.isNaN(target)) return null
  const prefix = str.slice(0, match.index)
  const suffix = str.slice((match.index ?? 0) + match[0].length)
  const hasDecimals = numericStr.includes('.')
  const decimalPlaces = hasDecimals ? (numericStr.split('.')[1]?.length ?? 0) : 0
  return { prefix, suffix, target, decimalPlaces }
}

function AnimatedValue({ value }: Readonly<{ value: string | number }>) {
  const ref = useRef<HTMLSpanElement>(null)
  const prevNumeric = useRef<number>(0)

  useEffect(() => {
    if (!ref.current) return
    const str = String(value)
    const parsed = parseFormattedNumber(str)
    if (!parsed) { ref.current.textContent = str; return }
    const { prefix, suffix, target, decimalPlaces } = parsed
    const motionVal = { v: prevNumeric.current }
    const ctrl = animate(motionVal, { v: target }, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: () => {
        if (!ref.current) return
        const formatted = motionVal.v.toLocaleString(undefined, {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        })
        ref.current.textContent = `${prefix}${formatted}${suffix}`
      },
    })
    prevNumeric.current = target
    return () => ctrl.stop()
  }, [value])

  return <span ref={ref}>{String(value)}</span>
}

interface MetricCardProps {
  title: string
  value: string | number
  change?: number
  invertChange?: boolean
  changeLabel?: string
  icon: LucideIcon
  color?: MetricColor
  isLoading?: boolean
  trend?: ReactNode
  subtitle?: string
}

export default function MetricCard({ title, value, change, invertChange, changeLabel, icon: Icon, color = 'blue', isLoading, trend, subtitle }: Readonly<MetricCardProps>) {
  const colors = metricColorConfig[color]

  if (isLoading) {
    return (
      <div className="p-4 glass rounded-xl">
        <div className="h-3 bg-white/[0.06] animate-pulse rounded w-1/2 mb-3" />
        <div className="h-6 bg-white/[0.06] animate-pulse rounded w-3/4" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative p-4 glass rounded-xl overflow-hidden transition-colors duration-150 ease-out hover:border-white/[0.08]"
    >
      {/* Sparkline as background */}
      {trend && (
        <div className="absolute inset-x-0 bottom-0 opacity-40 pointer-events-none">
          {trend}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="p-1.5 rounded-lg"
            style={{ background: colors.bg }}
          >
            <Icon className="w-4 h-4" style={{ color: colors.text }} />
          </div>
          <h3 className="text-xs font-medium text-zinc-400">{title}</h3>
        </div>

        <output className="block" aria-live="polite">
          <motion.p
            key={String(value)}
            initial={{ opacity: 0.6, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="text-xl font-bold text-white leading-tight"
          >
            <AnimatedValue value={value} />
          </motion.p>
        </output>

        {subtitle && (
          <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
        )}

        {change !== undefined && (() => {
          const isPositive = change >= 0
          const isGood = invertChange ? !isPositive : isPositive
          const c = isGood ? rawColors.ios.green : rawColors.ios.red
          return (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${isGood ? 'bg-ios-green/10' : 'bg-ios-red/10'}`}
                style={{ color: c }}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {change > 0 ? '+' : ''}{change}%
              </span>
              <span className="text-[10px] text-zinc-500">{changeLabel || 'vs last month'}</span>
            </div>
          )
        })()}
      </div>
    </motion.div>
  )
}

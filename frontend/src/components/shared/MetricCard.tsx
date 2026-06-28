import { type ReactNode, useEffect, useRef } from 'react'

import { motion, animate } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { metricColorConfig, rawColors, type MetricColor } from '@/constants/colors'
import { getActiveLocale } from '@/lib/formatters'

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
        // Group with the active display locale (en-IN, en-US, de-DE...) so the
        // count-up matches the currency the rest of the UI shows -- hardcoding
        // 'en-IN' produced lakh/crore grouping mid-animation for non-INR users.
        const formatted = motionVal.v.toLocaleString(getActiveLocale(), {
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
  /**
   * When set, the entire card becomes a clickable react-router Link.
   * Adds a subtle hover scale + a top-right arrow indicator. Mutually
   * exclusive with onClick.
   */
  href?: string
  /** When set, the entire card becomes clickable. */
  onClick?: () => void
  /**
   * Opt-in larger value readout for hero KPIs (the 3-4 headline numbers on a
   * page). Bumps the value to `text-kpi-hero` (24px). Default cards stay at
   * `text-kpi-value` (20px) so secondary metrics don't compete.
   */
  hero?: boolean
}

export default function MetricCard({
  title, value, change, invertChange, changeLabel, icon: Icon,
  color = 'blue', isLoading, trend, subtitle, href, onClick, hero = false,
}: Readonly<MetricCardProps>) {
  const colors = metricColorConfig[color]

  if (isLoading) {
    return (
      <div className="p-4 glass rounded-2xl">
        <div className="h-3 bg-white/[0.06] animate-pulse rounded w-1/2 mb-3" />
        <div className="h-6 bg-white/[0.06] animate-pulse rounded w-3/4" />
      </div>
    )
  }

  const isInteractive = Boolean(href || onClick)
  const interactiveClasses = isInteractive
    ? 'cursor-pointer hover:border-white/[0.15] hover:bg-white/[0.06] transition-all duration-150 group'
    : 'transition-colors duration-150 ease-out hover:border-white/[0.08]'

  const cardContent = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={isInteractive ? { y: -2 } : undefined}
      className={`relative p-4 glass rounded-2xl overflow-hidden ${interactiveClasses}`}
    >
      {/* Sparkline as background */}
      {trend && (
        <div className="absolute inset-x-0 bottom-0 opacity-40 pointer-events-none">
          {trend}
        </div>
      )}

      {/* Drill-down indicator -- only when clickable */}
      {isInteractive && (
        <ArrowUpRight
          className="absolute top-3 right-3 w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover:opacity-80 transition-opacity duration-150"
          aria-hidden
        />
      )}

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="p-2 rounded-xl"
            style={{ background: colors.bg }}
          >
            <Icon className="w-4 h-4" style={{ color: colors.text }} />
          </div>
          <h3 className="text-kpi-label font-medium text-muted-foreground">{title}</h3>
        </div>

        <output className="block" aria-live="polite">
          <motion.p
            key={String(value)}
            initial={{ opacity: 0.6, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            title={String(value)}
            className={`${hero ? 'text-kpi-hero' : 'text-kpi-value'} font-bold text-white leading-tight truncate`}
          >
            <AnimatedValue value={value} />
          </motion.p>
        </output>

        {subtitle && (
          <p className="text-overline text-text-tertiary mt-0.5">{subtitle}</p>
        )}

        {change !== undefined && (() => {
          const isPositive = change >= 0
          const isGood = invertChange ? !isPositive : isPositive
          const c = isGood ? rawColors.app.green : rawColors.app.red
          return (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${isGood ? 'bg-app-green/10' : 'bg-app-red/10'}`}
                style={{ color: c }}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {change > 0 ? '+' : ''}{change}%
              </span>
              <span className="text-caption text-text-tertiary">{changeLabel || 'vs last month'}</span>
            </div>
          )
        })()}
      </div>
    </motion.div>
  )

  if (href) {
    return (
      <Link to={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-app-blue/40 rounded-2xl">
        {cardContent}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-app-blue/40 rounded-2xl"
      >
        {cardContent}
      </button>
    )
  }

  return cardContent
}

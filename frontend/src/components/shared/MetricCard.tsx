import type { ReactNode } from 'react'

import { motion } from 'motion/react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { DURATION, EASING, TAP_FEEDBACK } from '@/constants/animations'
import { metricColorConfig, rawColors, type MetricColor } from '@/constants/colors'
import { useAnimatedValue } from '@/hooks/useAnimatedValue'
import { cn } from '@/lib/cn'
import { useMotionStore } from '@/store/motionStore'

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
  href?: string
  onClick?: () => void
  hero?: boolean
  /**
   * One-sentence hover explanation for computed metrics (XIRR, ratios) whose
   * meaning isn't obvious from the label. Rendered as a native title tooltip
   * on the card header.
   */
  titleInfo?: string
}

export default function MetricCard({
  title,
  value,
  change,
  invertChange,
  changeLabel,
  icon: Icon,
  color = 'blue',
  isLoading,
  trend,
  subtitle,
  href,
  onClick,
  hero = false,
  titleInfo,
}: Readonly<MetricCardProps>) {
  const colors = metricColorConfig[color]
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  // Count-up on the KPI figure (format-preserving; settles on the exact
  // original string). Hook order is stable: isLoading renders a skeleton with
  // no value, and this hook runs unconditionally before that branch.
  const animatedValue = useAnimatedValue(value)

  if (isLoading) {
    return (
      <output
        aria-label={`Loading ${title}`}
        aria-busy="true"
        className={cn('ledger-panel block h-full min-h-32 min-w-0 space-y-4 p-4', hero && 'sm:p-5')}
      >
        <span aria-hidden="true" className="skeleton-surface block h-3 w-1/2 rounded" />
        <span aria-hidden="true" className="skeleton-surface block h-7 w-3/4 rounded" />
      </output>
    )
  }

  const isInteractive = Boolean(href || onClick)
  const isPositive = (change ?? 0) >= 0
  const isGood = invertChange ? !isPositive : isPositive
  const changeColor = isGood ? rawColors.app.green : rawColors.app.red
  const ChangeIcon = isPositive ? ArrowUpRight : ArrowDownRight

  const content = (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={isInteractive && !reduceMotion ? { y: -2 } : undefined}
      whileTap={isInteractive && !reduceMotion ? TAP_FEEDBACK : undefined}
      transition={{ duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }}
      className={cn(
        'metric-card ledger-panel relative h-full min-h-32 min-w-0 overflow-hidden p-4 text-left',
        hero && 'sm:p-5',
        isInteractive && 'hover:border-[var(--hairline-4)]',
      )}
      style={{ transition: 'none' }}
    >
      {trend && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 opacity-20">
          {trend}
        </div>
      )}

      <div className="relative flex h-full min-w-0 flex-col gap-3">
        <div className="flow-root min-h-10">
          <Icon
            aria-hidden="true"
            className="float-right mt-0.5 ml-2 size-4"
            style={{ color: colors.text }}
          />
          <h3
            className="min-w-0 text-pretty text-xs font-medium leading-5 text-muted-foreground [overflow-wrap:anywhere]"
            title={titleInfo ?? (title.length > 24 ? title : undefined)}
          >
            {title}
          </h3>
        </div>

        <div className="min-w-0">
          <output
            className={cn(
              'metric-value ledger-figure block max-w-full whitespace-normal font-semibold leading-tight tracking-tight text-foreground tabular-nums [overflow-wrap:anywhere]',
              hero && 'metric-value-hero',
            )}
            title={String(value)}
            aria-live="polite"
          >
            {animatedValue}
          </output>
          {subtitle && (
            <p className="mt-1.5 text-pretty text-xs leading-5 text-text-tertiary [overflow-wrap:anywhere]" title={subtitle}>
              {subtitle}
            </p>
          )}
          {change !== undefined && (
            <div className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
              <span
                className="inline-flex max-w-full items-center gap-0.5 text-xs font-semibold tabular-nums [overflow-wrap:anywhere]"
                style={{ color: changeColor }}
              >
                <ChangeIcon aria-hidden="true" className="size-3 shrink-0" />
                <span className="min-w-0">
                  {change > 0 ? '+' : ''}
                  {change}%
                </span>
              </span>
              <span className="min-w-0 text-xs leading-5 text-text-tertiary [overflow-wrap:anywhere]">
                {changeLabel || 'vs last month'}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )

  if (href) {
    return (
      <Link
        to={href}
        className="block h-full min-w-0 touch-manipulation rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {content}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block h-full min-w-0 w-full touch-manipulation rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {content}
      </button>
    )
  }

  return content
}

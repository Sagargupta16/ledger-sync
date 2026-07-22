import type { ReactNode } from 'react'

import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { metricColorConfig, rawColors, type MetricColor } from '@/constants/colors'
import { cn } from '@/lib/cn'

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

  if (isLoading) {
    return (
      <div className="ledger-panel min-h-28 space-y-3 p-4">
        <div className="skeleton-surface h-3 w-1/2 rounded" />
        <div className="skeleton-surface h-7 w-3/4 rounded" />
      </div>
    )
  }

  const isInteractive = Boolean(href || onClick)
  const isPositive = (change ?? 0) >= 0
  const isGood = invertChange ? !isPositive : isPositive
  const changeColor = isGood ? rawColors.app.green : rawColors.app.red
  const ChangeIcon = isPositive ? ArrowUpRight : ArrowDownRight

  const content = (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        'metric-card ledger-panel group relative min-h-28 overflow-hidden p-4 text-left transition-colors duration-150',
        isInteractive && 'hover:border-[var(--hairline-4)] hover:bg-[var(--overlay-1)]',
      )}
    >
      {trend && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 opacity-20">
          {trend}
        </div>
      )}

      <div className="relative flex h-full flex-col justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-md border border-[var(--hairline-1)]"
            style={{ background: colors.bg }}
          >
            <Icon className="size-3.5" style={{ color: colors.text }} />
          </span>
          <h3
            className="min-w-0 truncate text-xs font-medium text-muted-foreground"
            title={titleInfo ?? (title.length > 24 ? title : undefined)}
          >
            {title}
          </h3>
        </div>

        <div>
          <output
            className={cn(
              'metric-value ledger-figure block whitespace-nowrap font-semibold leading-none text-foreground',
              hero && 'metric-value-hero',
            )}
            title={String(value)}
            aria-live="polite"
          >
            {value}
          </output>
          {subtitle && (
            <p className="mt-1 truncate text-[11px] text-text-tertiary" title={subtitle}>
              {subtitle}
            </p>
          )}
          {change !== undefined && (
            <div className="mt-2 flex min-w-0 items-center gap-1.5">
              <span
                className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums"
                style={{ color: changeColor }}
              >
                <ChangeIcon className="size-3" />
                {change > 0 ? '+' : ''}
                {change}%
              </span>
              <span className="truncate text-[11px] text-text-tertiary">
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
      <Link to={href} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        {content}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        {content}
      </button>
    )
  }

  return content
}

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import { formatCurrency, formatPercent } from '@/lib/formatters'

import { getDirectionIcon } from '../trendsUtils'
import type { TrendDirection, TrendMetrics } from '../types'

interface Props {
  metrics: TrendMetrics
  icon: React.ElementType
  iconBgClass: string
  iconColorClass: string
  label: string
  isPositiveGood: boolean
  isLoading: boolean
  valueClassName?: string
  averageClassName?: string
  secondStatLabel?: string
  secondStatClassName?: string
  className?: string
}

function getTrendIcon(direction: TrendDirection, positiveGood: boolean) {
  if (direction === 'stable') {
    return <Minus className="size-5 text-muted-foreground" aria-hidden="true" />
  }
  if (direction === 'up') {
    return positiveGood ? (
      <TrendingUp className="size-5 text-app-green" aria-hidden="true" />
    ) : (
      <TrendingUp className="size-5 text-app-red" aria-hidden="true" />
    )
  }
  return positiveGood ? (
    <TrendingDown className="size-5 text-app-red" aria-hidden="true" />
  ) : (
    <TrendingDown className="size-5 text-app-green" aria-hidden="true" />
  )
}

function getTrendColor(direction: TrendDirection, positiveGood: boolean) {
  if (direction === 'stable') return 'text-muted-foreground'
  if (direction === 'up') return positiveGood ? 'text-app-green' : 'text-app-red'
  return positiveGood ? 'text-app-red' : 'text-app-green'
}

export default function TrendCard({
  metrics,
  icon: Icon,
  iconBgClass,
  iconColorClass,
  label,
  isPositiveGood,
  isLoading,
  valueClassName = 'text-foreground',
  averageClassName = 'text-foreground',
  secondStatLabel = 'Peak',
  secondStatClassName = 'text-foreground',
  className = '',
}: Readonly<Props>) {
  const secondStatValue = metrics.highest

  return (
    <article className={`ledger-panel p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`shrink-0 rounded-md p-2 ${iconBgClass}`}>
            <Icon className={`size-5 ${iconColorClass}`} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            {isLoading ? (
              <LoadingSkeleton className="h-7 w-28 mt-1" />
            ) : (
              <p className={`ledger-figure break-words text-xl font-semibold ${valueClassName}`}>
                {formatCurrency(metrics.current)}
              </p>
            )}
          </div>
        </div>
        {!isLoading && getTrendIcon(metrics.direction, isPositiveGood)}
      </div>

      {!isLoading && (
        <div className="space-y-3">
          <div
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${getTrendColor(metrics.direction, isPositiveGood)}`}
          >
            {getDirectionIcon(metrics.direction)}
            <span className="ledger-figure font-semibold">
              {formatPercent(metrics.changePercent)}
            </span>
            <span className="text-text-tertiary text-sm">vs previous month</span>
          </div>
          <dl className="grid grid-cols-2 gap-3 border-t border-[var(--hairline-1)] pt-3">
            <div className="min-w-0">
              <dt className="text-xs text-text-tertiary">Average</dt>
              <dd className={`ledger-figure break-words text-sm font-medium ${averageClassName}`}>
                {formatCurrency(metrics.average)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-text-tertiary">{secondStatLabel}</dt>
              <dd
                className={`ledger-figure break-words text-sm font-medium ${secondStatClassName}`}
              >
                {formatCurrency(secondStatValue)}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </article>
  )
}

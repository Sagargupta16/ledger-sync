import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
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
  delay: number
  isLoading: boolean
  valueClassName?: string
  averageClassName?: string
  secondStatLabel?: string
  secondStatClassName?: string
}

function getTrendIcon(direction: TrendDirection, positiveGood: boolean) {
  if (direction === 'stable') return <Minus className="w-5 h-5 text-muted-foreground" />
  if (direction === 'up') {
    return positiveGood ? (
      <TrendingUp className="w-5 h-5 text-app-green" />
    ) : (
      <TrendingUp className="w-5 h-5 text-app-red" />
    )
  }
  return positiveGood ? (
    <TrendingDown className="w-5 h-5 text-app-red" />
  ) : (
    <TrendingDown className="w-5 h-5 text-app-green" />
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
  delay,
  isLoading,
  valueClassName = 'text-white',
  averageClassName = 'text-foreground',
  secondStatLabel = 'Peak',
  secondStatClassName = 'text-foreground',
}: Readonly<Props>) {
  const secondStatValue = metrics.highest

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 ${iconBgClass} rounded-xl`}>
            <Icon className={`w-6 h-6 ${iconColorClass}`} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-xl sm:text-2xl font-bold ${valueClassName}`}>
              {isLoading ? '...' : formatCurrency(metrics.current)}
            </p>
          </div>
        </div>
        {!isLoading && getTrendIcon(metrics.direction, isPositiveGood)}
      </div>

      {!isLoading && (
        <div className="space-y-3">
          <div
            className={`flex items-center gap-2 ${getTrendColor(metrics.direction, isPositiveGood)}`}
          >
            {getDirectionIcon(metrics.direction)}
            <span className="font-semibold">{formatPercent(metrics.changePercent)}</span>
            <span className="text-text-tertiary text-sm">vs previous month</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
            <div>
              <p className="text-xs text-text-tertiary">Average</p>
              <p className={`text-sm font-medium ${averageClassName}`}>
                {formatCurrency(metrics.average)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">{secondStatLabel}</p>
              <p className={`text-sm font-medium ${secondStatClassName}`}>
                {formatCurrency(secondStatValue)}
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

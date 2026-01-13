import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

interface MetricCardProps {
  title: string
  value: string | number
  change?: number
  icon: LucideIcon
  color?: 'green' | 'red' | 'blue' | 'purple' | 'yellow'
  isLoading?: boolean
  trend?: ReactNode
}

const colorClasses = {
  green: 'bg-green-500/10 text-green-500',
  red: 'bg-red-500/10 text-red-500',
  blue: 'bg-blue-500/10 text-blue-500',
  purple: 'bg-purple-500/10 text-purple-500',
  yellow: 'bg-yellow-500/10 text-yellow-500',
}

export default function MetricCard({ title, value, change, icon: Icon, color = 'blue', isLoading, trend }: MetricCardProps) {
  if (isLoading) {
    return (
      <div className="p-6 glass rounded-2xl animate-pulse">
        <div className="h-4 bg-muted rounded w-1/2 mb-4" />
        <div className="h-8 bg-muted rounded w-3/4 mb-2" />
        <div className="h-3 bg-muted rounded w-1/3" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative p-6 glass rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-primary/20 transition-all duration-300 group border border-white/10"
    >
      {/* Background gradient glow */}
      <div className={cn('absolute top-0 right-0 w-40 h-40 opacity-20 blur-3xl transition-opacity group-hover:opacity-30', colorClasses[color])} />
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Icon */}
      <div className={cn('inline-flex p-3 rounded-xl mb-4 relative z-10', colorClasses[color])}>
        <Icon className="w-6 h-6" />
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-muted-foreground mb-1 relative z-10">{title}</h3>

      {/* Value */}
      <div className="flex items-baseline gap-2 relative z-10">
        <p className="text-3xl font-bold">{value}</p>
      </div>

      {/* Sparkline/Trend */}
      {trend && (
        <div className="mt-2 relative z-10 opacity-70">
          {trend}
        </div>
      )}

      {/* Change indicator */}
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-2 relative z-10">
          {change >= 0 ? (
            <TrendingUp className="w-4 h-4 text-green-500" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-500" />
          )}
          <span className={cn('text-sm font-medium', change >= 0 ? 'text-green-500' : 'text-red-500')}>
            {Math.abs(change)}%
          </span>
          <span className="text-xs text-muted-foreground ml-1">vs last month</span>
        </div>
      )}
    </motion.div>
  )
}

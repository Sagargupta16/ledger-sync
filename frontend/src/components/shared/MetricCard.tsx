import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'
import { metricColorConfig, rawColors, type MetricColor } from '@/constants/colors'

interface MetricCardProps {
  title: string
  value: string | number
  change?: number
  icon: LucideIcon
  color?: MetricColor
  isLoading?: boolean
  trend?: ReactNode
}

export default function MetricCard({ title, value, change, icon: Icon, color = 'blue', isLoading, trend }: MetricCardProps) {
  const colors = metricColorConfig[color]

  if (isLoading) {
    return (
      <div className="p-6 glass rounded-2xl">
        <div className="h-4 skeleton w-1/2 mb-4" />
        <div className="h-8 skeleton w-3/4 mb-2" />
        <div className="h-3 skeleton w-1/3" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative p-6 glass rounded-2xl overflow-hidden group border border-white/[0.08] transition-all duration-300 hover:border-white/[0.12] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30"
    >
      {/* Subtle gradient glow on hover */}
      <div 
        className="absolute top-0 right-0 w-32 h-32 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
        style={{ background: colors.glow }}
      />

      {/* Icon */}
      <div 
        className="inline-flex p-3 rounded-2xl mb-4 relative z-10"
        style={{ 
          background: colors.bg,
          boxShadow: `0 8px 24px ${colors.glow}`
        }}
      >
        <Icon className="w-6 h-6" style={{ color: colors.text }} />
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium mb-1 relative z-10" style={{ color: rawColors.text.secondary }}>{title}</h3>

      {/* Value */}
      <div className="flex items-baseline gap-2 relative z-10">
        <p className="text-3xl font-semibold text-white">{value}</p>
      </div>

      {/* Sparkline/Trend */}
      {trend && (
        <div className="mt-3 relative z-10 opacity-80">
          {trend}
        </div>
      )}

      {/* Change indicator */}
      {change !== undefined && (
        <div className="flex items-center gap-1.5 mt-3 relative z-10">
          {change >= 0 ? (
            <TrendingUp className="w-4 h-4" style={{ color: rawColors.ios.green }} />
          ) : (
            <TrendingDown className="w-4 h-4" style={{ color: rawColors.ios.red }} />
          )}
          <span 
            className="text-sm font-medium"
            style={{ color: change >= 0 ? rawColors.ios.green : rawColors.ios.red }}
          >
            {Math.abs(change)}%
          </span>
          <span className="text-xs ml-1" style={{ color: rawColors.text.tertiary }}>vs last month</span>
        </div>
      )}
    </motion.div>
  )
}

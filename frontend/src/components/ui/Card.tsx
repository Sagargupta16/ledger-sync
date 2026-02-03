import { memo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface CardProps {
  children: ReactNode
  className?: string
  animate?: boolean
  delay?: number
  variant?: 'default' | 'elevated' | 'interactive'
}

/**
 * iOS-style frosted glass card component
 * Provides consistent styling across the application
 */
export const Card = memo(function Card({ 
  children, 
  className,
  animate = true,
  delay = 0,
  variant = 'default'
}: CardProps) {
  const variantClasses = {
    default: 'glass rounded-2xl border border-white/[0.08] p-6 shadow-lg shadow-black/20',
    elevated: 'glass-strong rounded-2xl border border-white/[0.1] p-6 shadow-xl shadow-black/30',
    interactive: 'glass rounded-2xl border border-white/[0.08] p-6 shadow-lg shadow-black/20 transition-all duration-300 hover:bg-[rgba(38,38,40,0.6)] hover:border-white/[0.12] hover:-translate-y-0.5 hover:shadow-xl'
  }
  
  if (animate) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(variantClasses[variant], className)}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div className={cn(variantClasses[variant], className)}>
      {children}
    </div>
  )
})

interface CardHeaderProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  action?: ReactNode
}

/**
 * Card header with title, optional icon, and action slot
 */
export const CardHeader = memo(function CardHeader({ 
  title, 
  subtitle, 
  icon, 
  action 
}: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="p-2.5 bg-[#0a84ff]/20 rounded-xl">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {subtitle && (
            <p className="text-sm text-[#98989f]">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
})

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: ReactNode
  iconColor?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  delay?: number
}

/**
 * iOS-style statistic card for displaying KPIs
 */
export const StatCard = memo(function StatCard({
  title,
  value,
  subtitle,
  icon,
  iconColor = '#0a84ff',
  trend,
  delay = 0
}: StatCardProps) {
  return (
    <Card delay={delay} variant="interactive">
      <div className="flex items-center gap-3">
        {icon && (
          <div 
            className="p-3 rounded-2xl"
            style={{ 
              background: `${iconColor}20`,
              boxShadow: `0 8px 24px ${iconColor}30`
            }}
          >
            <div style={{ color: iconColor }}>{icon}</div>
          </div>
        )}
        <div className="flex-1">
          <p className="text-sm text-[#98989f]">{title}</p>
          <p className="text-2xl font-semibold text-white">{value}</p>
          {subtitle && (
            <p className="text-xs text-[#636366] mt-1">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'text-xs mt-1 font-medium',
              trend.isPositive ? 'text-[#30d158]' : 'text-[#ff453a]'
            )}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
      </div>
    </Card>
  )
})

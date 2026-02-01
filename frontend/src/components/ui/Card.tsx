import { memo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface CardProps {
  children: ReactNode
  className?: string
  animate?: boolean
  delay?: number
}

/**
 * Reusable glass morphism card component
 * Provides consistent styling across the application
 */
export const Card = memo(function Card({ 
  children, 
  className,
  animate = true,
  delay = 0 
}: CardProps) {
  const baseClasses = 'glass rounded-xl border border-white/10 p-6 shadow-lg'
  
  if (animate) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay }}
        className={cn(baseClasses, className)}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div className={cn(baseClasses, className)}>
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
          <div className="p-2 bg-primary/20 rounded-lg">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
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
 * Statistic card for displaying KPIs
 */
export const StatCard = memo(function StatCard({
  title,
  value,
  subtitle,
  icon,
  iconColor = 'text-primary',
  trend,
  delay = 0
}: StatCardProps) {
  return (
    <Card delay={delay}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className={cn('p-3 rounded-xl shadow-lg', `bg-${iconColor}/20 shadow-${iconColor}/30`)}>
            <div className={iconColor}>{icon}</div>
          </div>
        )}
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'text-xs mt-1',
              trend.isPositive ? 'text-green-400' : 'text-red-400'
            )}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
      </div>
    </Card>
  )
})

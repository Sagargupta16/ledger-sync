import { memo, type ReactNode } from 'react'
import { rawColors } from '@/constants/colors'
import { cn } from '@/lib/cn'

interface CardProps {
  children: ReactNode
  className?: string
  animate?: boolean
  delay?: number
  variant?: 'default' | 'interactive'
}

/**
 * Frosted glass card component with restrained styling.
 * Provides consistent card appearance across the application.
 */
export const Card = memo(function Card({
  children,
  className,
  animate = true,
  delay = 0,
  variant = 'default'
}: CardProps) {
  const variantClasses = {
    default: 'glass rounded-2xl border border-border p-6',
    interactive: 'glass rounded-2xl border border-border p-6 transition-all duration-150 ease-out hover:border-white/[0.10]'
  }

  if (animate) {
    return (
      <div
        className={cn(variantClasses[variant], 'animate-fade-up', className)}
        style={{ animationDelay: `${delay * 1000}ms` }}
      >
        {children}
      </div>
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
 * Card header with title, optional icon, and action slot.
 * Clean typographic hierarchy with restrained icon backgrounds.
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
          <div className="p-2.5 bg-blue-500/10 rounded-xl">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-sm font-medium text-white">{title}</h3>
          {subtitle && (
            <p className="text-xs text-text-tertiary">{subtitle}</p>
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
 * Statistic card for displaying KPIs with clean typography
 * and restrained icon backgrounds.
 */
export const StatCard = memo(function StatCard({
  title,
  value,
  subtitle,
  icon,
  iconColor = rawColors.app.blueVibrant,
  trend,
  delay = 0
}: StatCardProps) {
  return (
    <Card delay={delay} variant="interactive">
      <div className="flex items-center gap-3">
        {icon && (
          <div
            className="p-2.5 rounded-xl"
            style={{
              background: `${iconColor}10`
            }}
          >
            <div style={{ color: iconColor }}>{icon}</div>
          </div>
        )}
        <div className="flex-1">
          <p className="text-xs text-text-tertiary">{title}</p>
          <p className="text-lg sm:text-xl font-semibold text-white">{value}</p>
          {subtitle && (
            <p className="text-[11px] text-text-quaternary mt-1">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'text-xs mt-1 font-medium',
              trend.isPositive ? 'text-green-400' : 'text-red-400'
            )}>
              {trend.isPositive ? '\u2191' : '\u2193'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
      </div>
    </Card>
  )
})

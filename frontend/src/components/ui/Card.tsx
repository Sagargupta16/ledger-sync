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
    default: 'glass rounded-2xl border border-[var(--glass-border)] p-5 sm:p-6',
    interactive: 'glass rounded-2xl border border-[var(--glass-border)] p-5 sm:p-6 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-[var(--hairline-3)] hover:bg-[var(--overlay-2)]'
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
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="shrink-0 rounded-xl border border-[var(--hairline-2)] bg-app-blue/10 p-2.5">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-text-tertiary">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
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
          <p className="ledger-figure text-lg sm:text-xl font-semibold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-[11px] text-text-quaternary mt-1">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'text-xs mt-1 font-medium',
              trend.isPositive ? 'text-app-green' : 'text-app-red'
            )}>
              {trend.isPositive ? '\u2191' : '\u2193'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
      </div>
    </Card>
  )
})

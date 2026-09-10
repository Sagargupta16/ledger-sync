import { memo, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { DURATION, fadeUpWithDelay } from '@/constants/animations'
import { rawColors } from '@/constants/colors'
import { cn } from '@/lib/cn'
import { useMotionStore } from '@/store/motionStore'

interface CardProps {
  children: ReactNode
  className?: string
  animate?: boolean
  delay?: number
  variant?: 'default' | 'interactive'
}

/**
 * Flat surface card component with restrained styling.
 * Provides consistent card appearance across the application.
 */
export const Card = memo(function Card({
  children,
  className,
  animate = true,
  delay = 0,
  variant = 'default'
}: CardProps) {
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const entrance = fadeUpWithDelay(delay)
  const variantClasses = {
    default: '',
    interactive: cn(
      'hover:border-[var(--hairline-4)] hover:bg-surface-hover',
      !reduceMotion && 'hover:-translate-y-0.5',
    )
  }
  const cardClassName = cn(
    'min-w-0 rounded-lg border border-[var(--glass-border)] bg-surface-1 p-4 shadow-[var(--glass-shadow)] sm:p-5',
    variantClasses[variant],
    className,
  )
  const interactionStyle = variant === 'interactive' ? {
    transitionProperty: 'translate',
    transitionDuration: 'var(--duration-fast)',
    transitionTimingFunction: 'var(--ease-cinematic)',
  } : undefined

  if (animate) {
    return (
      <motion.div
        initial={reduceMotion ? false : entrance.initial}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          ...entrance.transition,
          delay: reduceMotion ? 0 : entrance.transition.delay,
          duration: reduceMotion ? 0 : DURATION.quick,
        }}
        className={cardClassName}
        style={interactionStyle}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div className={cardClassName} style={interactionStyle}>
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
 * Clear typographic hierarchy with inline icons.
 */
export const CardHeader = memo(function CardHeader({
  title,
  subtitle,
  icon,
  action
}: CardHeaderProps) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-1 basis-40 items-start gap-2.5">
        {icon && (
          <div className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:size-4">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-pretty text-sm font-semibold leading-5 text-foreground [overflow-wrap:anywhere]">{title}</h3>
          {subtitle && (
            <p className="mt-1 text-pretty text-xs leading-5 text-text-tertiary [overflow-wrap:anywhere]">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 [&>*]:max-w-full">{action}</div>}
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
 * Statistic card with a full-width figure and optional trend.
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
    <Card delay={delay} className="metric-card h-full">
      <div className="flex h-full min-w-0 flex-col justify-between gap-4">
        <div className="flow-root min-h-10">
          {icon && (
            <div
              className="float-right mt-0.5 ml-2 [&>svg]:size-4"
              style={{ color: iconColor }}
            >
              {icon}
            </div>
          )}
          <p className="min-w-0 text-pretty text-xs font-medium leading-5 text-muted-foreground [overflow-wrap:anywhere]">{title}</p>
        </div>
        <div className="min-w-0">
          <p className="metric-value ledger-figure max-w-full font-semibold leading-tight tracking-tight text-foreground tabular-nums [overflow-wrap:anywhere]" title={String(value)}>{value}</p>
          {subtitle && (
            <p className="mt-1.5 text-pretty text-xs leading-5 text-text-tertiary [overflow-wrap:anywhere]">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'mt-3 text-xs font-medium tabular-nums [overflow-wrap:anywhere]',
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

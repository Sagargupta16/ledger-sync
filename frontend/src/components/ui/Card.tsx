import { memo, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { DURATION, fadeUpWithDelay } from '@/constants/animations'
import { colors } from '@/constants/colors'
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

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: ReactNode
  iconColor?: string
  delay?: number
}

/**
 * Statistic card with a full-width figure.
 */
export const StatCard = memo(function StatCard({
  title,
  value,
  subtitle,
  icon,
  iconColor = colors.app.blueVibrant,
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
        </div>
      </div>
    </Card>
  )
})

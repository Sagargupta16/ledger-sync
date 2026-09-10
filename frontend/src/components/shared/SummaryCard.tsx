import { motion } from 'motion/react'

import { DURATION, fadeUpWithDelay } from '@/constants/animations'
import { cn } from '@/lib/cn'
import { useMotionStore } from '@/store/motionStore'

interface SummaryCardProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  /** Tailwind class for the icon foreground color (e.g. 'text-app-green'). */
  colorClass: string
  /** Tailwind class for the icon background tint (e.g. 'bg-app-green/15'). */
  bgClass: string
  /** Optional class for a legacy caller-specific icon treatment. */
  shadowClass?: string
  /** Stagger delay for the entrance animation. */
  delay: number
  /**
   * When true, uses tighter mobile padding (``p-4 md:p-6``). Default
   * uses ``p-6`` flat. Pages with several cards in a row (subscription
   * tracker, income-expense flow) typically want compact; pages with
   * fewer can leave it off.
   */
  compact?: boolean
}

/**
 * Compact icon + label + value card. Used by the bill-calendar,
 * subscription-tracker, and income-expense-flow pages for the row of
 * top-of-page summary metrics.
 *
 * Distinct from ``MetricCard`` (in shared/) which carries change badges,
 * subtitles, and an animated number; this version is intentionally
 * static for "headline figures" without trend overlays.
 */
export default function SummaryCard({
  icon: Icon,
  label,
  value,
  colorClass,
  bgClass,
  shadowClass,
  delay,
  compact = false,
}: Readonly<SummaryCardProps>) {
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const entrance = fadeUpWithDelay(delay)
  const padding = compact ? 'p-4 md:p-6' : 'p-6'
  return (
    <motion.div
      {...entrance}
      initial={reduceMotion ? false : entrance.initial}
      transition={{
        ...entrance.transition,
        delay: reduceMotion ? 0 : entrance.transition.delay,
        duration: reduceMotion ? 0 : DURATION.quick,
      }}
      className={cn('metric-card ledger-panel flex h-full min-w-0 flex-col justify-between gap-4', padding)}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn('flex size-6 shrink-0 items-center justify-center rounded-full', bgClass, shadowClass)}
        >
          <Icon className={cn('size-3.5', colorClass)} />
        </span>
        <p className="min-w-0 pt-0.5 text-pretty text-xs font-medium leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          {label}
        </p>
      </div>
      <p
        className="metric-value ledger-figure min-w-0 max-w-full whitespace-normal font-semibold leading-tight tracking-tight text-foreground tabular-nums [overflow-wrap:anywhere]"
        title={value}
      >
        {value}
      </p>
    </motion.div>
  )
}

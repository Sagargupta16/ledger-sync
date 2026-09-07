import { motion } from 'motion/react'

import { fadeUpWithDelay } from '@/constants/animations'

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
  const padding = compact ? 'p-4 md:p-6' : 'p-6'
  return (
    <motion.div
      {...fadeUpWithDelay(delay)}
      className={`ledger-panel h-full ${padding}`}
    >
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <div className={`flex size-8 shrink-0 items-center justify-center rounded-md ${bgClass} ${shadowClass ?? ''}`}>
          <Icon className={`size-4 ${colorClass}`} />
        </div>
        <div className="min-w-0 w-full">
          <p className="break-words text-xs text-muted-foreground">{label}</p>
          <p className="ledger-figure break-words text-lg font-semibold leading-tight text-foreground sm:text-xl">
            {value}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

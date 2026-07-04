import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'

import ProgressBar from '@/components/shared/ProgressBar'
import { formatCurrency } from '@/lib/formatters'
import type { SpendingBucket } from '@/services/api/analyticsV2'

/**
 * One of the three big header cards on the /budgets page (Needs, Wants, Savings).
 *
 * Design: title + description + big amount + progress bar showing current% vs
 * target with a color that reflects on-target status. Score-delta line at the
 * bottom mirrors the user's spec ("−5 pts vs target").
 */
interface Props {
  readonly bucket: SpendingBucket
  readonly title: string
  readonly description: string
  readonly icon: LucideIcon
  /** 'cap' = target is a maximum (Needs, Wants). 'floor' = target is a minimum (Savings). */
  readonly kind: 'cap' | 'floor'
  readonly amount: number
  readonly pctOfIncome: number
  readonly target: number
  /** Signed: positive = on the good side of target. */
  readonly scoreDelta: number
  readonly hasIncome: boolean
}

/**
 * Bucket color: pass/warn/fail based on the score delta.
 * - Green: on-target (Needs<=50, Wants<=30, Savings>=20).
 * - Amber: within 5 points of missing the target (leaning wrong).
 * - Red: clearly off-target (5+ points wrong side).
 */
function statusFor(scoreDelta: number, hasIncome: boolean): 'good' | 'warn' | 'bad' {
  if (!hasIncome) return 'warn'
  if (scoreDelta >= 0) return 'good'
  if (scoreDelta > -5) return 'warn'
  return 'bad'
}

const STATUS_COLORS = {
  good: 'text-app-green',
  warn: 'text-app-orange',
  bad: 'text-app-red',
} as const

const PROGRESS_TINTS = {
  needs: 'var(--color-app-blue)',
  wants: 'var(--color-app-orange)',
  savings: 'var(--color-app-green)',
} as const

export function BucketCard({
  bucket,
  title,
  description,
  icon: Icon,
  kind,
  amount,
  pctOfIncome,
  target,
  scoreDelta,
  hasIncome,
}: Props) {
  const status = statusFor(scoreDelta, hasIncome)

  // Cap-kind cards fill from 0 -> target -> over (bar can exceed 100%).
  // Floor-kind card fills from 0 -> target and stops (savings above 100% is
  // still 100% full visually; the score-delta line shows the surplus).
  const progressPct = kind === 'cap' ? pctOfIncome : Math.min(pctOfIncome, target)
  const isOverCap = kind === 'cap' && pctOfIncome > target

  const targetLabel =
    kind === 'cap' ? `Target: ≤${target}% of income` : `Target: ≥${target}% of income`

  const deltaLabel = scoreDelta === 0
    ? 'on target'
    : `${scoreDelta > 0 ? '+' : ''}${scoreDelta.toFixed(0)} pts vs target`

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className="glass-card rounded-2xl p-5 flex flex-col gap-3"
      aria-label={`${title} bucket, ${pctOfIncome.toFixed(1)} percent of income, ${deltaLabel}`}
    >
      {/* Top row: icon + title + description */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-[var(--overlay-5)]" aria-hidden="true">
          <Icon className="w-5 h-5 text-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <span className="text-xs text-muted-foreground">({target}%)</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      {/* Big amount */}
      <div className="text-3xl font-semibold tabular-nums text-foreground">
        {formatCurrency(amount)}
      </div>

      {/* Progress bar with % label */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Current</span>
          <span
            className={`text-sm font-semibold tabular-nums ${
              isOverCap ? 'text-app-red' : STATUS_COLORS[status]
            }`}
          >
            {pctOfIncome.toFixed(1)}%
          </span>
        </div>
        <ProgressBar
          value={progressPct}
          max={Math.max(target, pctOfIncome, 1)}
          color={PROGRESS_TINTS[bucket]}
          height={8}
          target={target}
          ariaLabel={`${title} at ${pctOfIncome.toFixed(1)} percent of income`}
        />
      </div>

      {/* Footer: target + delta */}
      <div className="text-xs text-muted-foreground pt-1 border-t border-[var(--overlay-5)]">
        {targetLabel} · <span className={STATUS_COLORS[status]}>{deltaLabel}</span>
      </div>
    </motion.div>
  )
}

import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'

import ProgressBar from '@/components/shared/ProgressBar'
import { EASING } from '@/constants/animations'
import { formatCurrency } from '@/lib/formatters'
import type { SpendingBucket } from '@/services/api/analyticsV2'
import { useMotionStore } from '@/store/motionStore'

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
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const status = statusFor(scoreDelta, hasIncome)

  // Cap-kind cards fill from 0 -> target -> over (bar can exceed 100%).
  // Floor-kind card fills from 0 -> target and stops (savings above 100% is
  // still 100% full visually; the score-delta line shows the surplus).
  const progressPct = kind === 'cap' ? pctOfIncome : Math.min(pctOfIncome, target)
  const isOverCap = kind === 'cap' && pctOfIncome > target
  const progressMax = Math.max(target, pctOfIncome, 1)
  const targetPosition = Math.max(0, Math.min(100, (target / progressMax) * 100))

  const targetLabel =
    kind === 'cap' ? `Target: ≤${target}% of income` : `Target: ≥${target}% of income`

  const deltaSign = scoreDelta > 0 ? '+' : ''
  const deltaLabel =
    scoreDelta === 0
      ? 'on target'
      : `${deltaSign}${scoreDelta.toFixed(0)} pts vs target`

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.32, ease: EASING.cinematic }}
      className="@container/bucket ledger-panel flex h-full min-w-0 flex-col p-4 sm:p-5"
      aria-label={`${title} bucket, ${pctOfIncome.toFixed(1)} percent of income, ${deltaLabel}`}
    >
      {/* Top row: icon + title + description */}
      <div className="flex min-h-20 items-start justify-between gap-3 @max-[14rem]/bucket:min-h-24">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-6 text-foreground">{title}</h3>
          <p className="mt-1 text-pretty text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <div className="mt-0.5 shrink-0 rounded-md bg-[var(--overlay-3)] p-2" aria-hidden="true">
          <Icon className="size-4" style={{ color: PROGRESS_TINTS[bucket] }} />
        </div>
      </div>

      {/* Big amount -- KPI hero scale, matches MetricCard hero */}
      <div className="ledger-figure mt-5 break-words font-mono text-xl font-semibold leading-tight text-foreground tabular-nums @min-[16rem]/bucket:text-2xl">
        {formatCurrency(amount)}
      </div>

      {/* Progress bar with % label */}
      <div className="mt-auto pt-5">
        <dl className="mb-3 flex items-end justify-between gap-3">
          <div>
            <dt className="text-xs leading-5 text-muted-foreground">Current</dt>
            <dd className={`mt-1 font-mono text-lg font-semibold leading-6 tabular-nums ${
              isOverCap ? 'text-app-red' : STATUS_COLORS[status]
            }`}>
              {pctOfIncome.toFixed(1)}%
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-xs leading-5 text-muted-foreground">{kind === 'cap' ? 'Ceiling' : 'Minimum'}</dt>
            <dd className="mt-1 font-mono text-lg font-medium leading-6 text-foreground tabular-nums">
              {target}%
            </dd>
          </div>
        </dl>
        <div className="relative">
          <ProgressBar
            value={progressPct}
            max={progressMax}
            color={PROGRESS_TINTS[bucket]}
            height={8}
            target={target}
            bands={kind === 'floor' && pctOfIncome > target ? [
              { upTo: targetPosition, color: 'transparent' },
              { upTo: 100, color: 'color-mix(in srgb, var(--color-app-green) 20%, transparent)' },
            ] : undefined}
            ariaLabel={`${title} at ${pctOfIncome.toFixed(1)} percent of income`}
          />
          <span
            className="pointer-events-none absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            style={{ left: `${targetPosition}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-text-tertiary tabular-nums" aria-hidden="true">
          <span>0%</span>
          <span>{Number(progressMax.toFixed(1))}% of income</span>
        </div>
      </div>

      {/* Footer: target + delta */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[var(--hairline-1)] pt-3 text-xs leading-5 text-muted-foreground tabular-nums">
        <span>{targetLabel}</span>
        <span className={`inline-flex items-center gap-1.5 font-medium ${STATUS_COLORS[status]}`}>
          <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
          {deltaLabel}
        </span>
      </div>
    </motion.div>
  )
}

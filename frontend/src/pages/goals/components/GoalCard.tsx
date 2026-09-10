import { motion } from 'motion/react'
import { formatCurrency } from '@/lib/formatters'
import { parseLocalDate } from '@/lib/dateUtils'
import { ProgressBar } from '@/components/shared'
import { EASING } from '@/constants/animations'
import { colors } from '@/constants/colors'
import { useMotionStore } from '@/store/motionStore'
import { goalTypeColor, goalTypeLabel } from '../constants'
import type { GoalProjection } from '../types'
import { differenceInMonths } from '../helpers'
import CircularProgress from './CircularProgress'
import GoalProjections from './GoalProjections'
import GoalCardActions, { type GoalCardActionsProps } from './GoalCardActions'

const GOAL_TYPE_TINTS: Record<string, string> = {
  savings: colors.app.green,
  debt_payoff: colors.app.red,
  investment: colors.app.blue,
  expense_reduction: colors.app.orange,
  income_increase: colors.app.purple,
  custom: colors.app.teal,
}

export default function GoalCard({
  goal,
  effectiveAmount,
  projection,
  avgMonthlySavings,
  ...actions
}: Readonly<GoalCardActionsProps & {
  projection: GoalProjection
  avgMonthlySavings: number | null
}>) {
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  // Live theme tokens keep the presentation in sync when the theme changes.
  // Retain the existing fallback for historical or unknown goal types.
  const color = GOAL_TYPE_TINTS[goal.goal_type] ?? goalTypeColor(goal.goal_type)
  const progressPct = goal.target_amount > 0 ? (effectiveAmount / goal.target_amount) * 100 : 0
  const remaining = Math.max(0, goal.target_amount - effectiveAmount)

  // "On-pace" tick: the % of the target you should have funded by now, given how
  // much of the goal's timeline (start_date -> target_date) has elapsed. The ring
  // shows where you ARE; this tick shows where you SHOULD be -- the gap is the story.
  // Derived from projection.monthsRemaining (already computed against "now" in the
  // hook) so we stay render-pure: elapsed = totalSpan - monthsRemaining.
  // Skip when the goal is open-ended (no deadline) or already achieved.
  // `start_date` is nullable on the wire, and without one there is no timeline
  // to measure elapsed time against, so there is no pace to show.
  const onPacePct = (() => {
    if (!goal.target_date || !goal.start_date || projection.status === 'achieved')
      return undefined
    const totalSpan = differenceInMonths(parseLocalDate(goal.target_date), parseLocalDate(goal.start_date))
    if (!Number.isFinite(totalSpan) || totalSpan <= 0) return undefined
    const elapsedFraction = (totalSpan - projection.monthsRemaining) / totalSpan
    return Math.max(0, Math.min(100, elapsedFraction * 100))
  })()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASING.cinematic }}
      className="@container/goal ledger-panel flex h-full min-w-0 flex-col p-4 sm:p-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <span
            className="inline-flex items-center gap-2 text-xs font-medium leading-5"
            style={{ color }}
          >
            <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
            {goalTypeLabel(goal.goal_type)}
          </span>
          <h4 className="mt-1 break-words text-balance text-lg font-semibold leading-6 text-foreground">
            {goal.name}
          </h4>
        </div>
        <div className="relative flex shrink-0 items-center justify-center" aria-hidden="true">
          <CircularProgress progress={progressPct} color={color} size={64} />
          <span className="absolute flex flex-col items-center gap-0.5">
            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">{Math.round(progressPct)}%</span>
            <span className="text-[9px] text-text-tertiary">funded</span>
          </span>
        </div>
      </div>

      {/* Amount Details */}
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
        <div className="col-span-2 min-w-0">
          <dt className="text-xs leading-5 text-text-tertiary">Allocated</dt>
          <dd className="ledger-figure mt-1 break-words font-mono text-2xl font-semibold leading-tight text-foreground tabular-nums @min-[24rem]/goal:text-3xl">
            {formatCurrency(effectiveAmount)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs leading-5 text-text-tertiary">Target</dt>
          <dd className="ledger-figure mt-1 break-words font-mono text-sm font-medium text-foreground tabular-nums">
            {formatCurrency(goal.target_amount)}
          </dd>
        </div>
        <div className="min-w-0 text-right">
          <dt className="text-xs leading-5 text-text-tertiary">Remaining</dt>
          <dd className="ledger-figure mt-1 break-words font-mono text-sm font-medium text-foreground tabular-nums">
            {formatCurrency(remaining)}
          </dd>
        </div>
      </dl>

      {/* Funded vs on-pace -- the tick marks where you should be by now */}
      <div className="mt-5">
        <div className="relative">
          <ProgressBar
            value={progressPct}
            color={color}
            height={8}
            target={onPacePct}
            ariaLabel={`${goal.name} progress: ${Math.round(progressPct)} percent funded`}
          />
          {onPacePct !== undefined && (
            <span
              className="pointer-events-none absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
              style={{ left: `${onPacePct}%` }}
              aria-hidden="true"
            />
          )}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-text-tertiary tabular-nums" aria-hidden="true">
          <span>0%</span>
          <span>100% funded</span>
        </div>
        {onPacePct !== undefined && (
          <p className="mt-2 text-xs leading-5 text-text-tertiary tabular-nums">
            {progressPct >= onPacePct ? (
              <span style={{ color: colors.app.green }}>
                {Math.round(progressPct - onPacePct)}% ahead of pace
              </span>
            ) : (
              <span style={{ color: colors.app.orange }}>
                {Math.round(onPacePct - progressPct)}% behind pace
              </span>
            )}
            <span> &middot; should be {Math.round(onPacePct)}% by now</span>
          </p>
        )}
      </div>

      {/* Smart Projections */}
      <GoalProjections goal={goal} projection={projection} avgMonthlySavings={avgMonthlySavings} />

      {goal.notes && <p className="mt-3 break-words text-pretty text-sm leading-6 text-text-tertiary">{goal.notes}</p>}
      <div className="mt-auto pt-4">
        <GoalCardActions goal={goal} effectiveAmount={effectiveAmount} {...actions} />
      </div>
    </motion.div>
  )
}

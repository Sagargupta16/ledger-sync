import { motion } from 'motion/react'
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters'
import { parseLocalDate } from '@/lib/dateUtils'
import { ProgressBar } from '@/components/shared'
import { rawColors } from '@/constants/colors'
import { goalTypeColor, goalTypeLabel } from '../constants'
import type { GoalProjection } from '../types'
import { differenceInMonths } from '../helpers'
import CircularProgress from './CircularProgress'
import GoalProjections from './GoalProjections'
import GoalCardActions, { type GoalCardActionsProps } from './GoalCardActions'

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
  // Accessor, not a direct index: an unmapped `goal_type` used to make this
  // `undefined`, which the chip below interpolated into the literal CSS value
  // "undefined20" and the browser dropped.
  const color = goalTypeColor(goal.goal_type)
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="ledger-panel p-4 sm:p-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="break-words text-lg font-semibold leading-tight text-foreground">
            {goal.name}
          </h4>
          <span
            className="inline-block mt-1 px-2.5 py-0.5 text-xs rounded-full font-medium"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {goalTypeLabel(goal.goal_type)}
          </span>
        </div>
        <div className="relative flex items-center justify-center flex-shrink-0 ml-3">
          <CircularProgress progress={progressPct} color={color} />
          <span className="absolute text-sm font-bold text-foreground">{Math.round(progressPct)}%</span>
        </div>
      </div>

      {/* Amount Details */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-5">
        <div className="min-w-0">
          <p className="text-xs text-text-tertiary">Target</p>
          <p className="ledger-figure whitespace-nowrap text-sm font-medium text-foreground">
            <span className="sm:hidden">{formatCurrencyCompact(goal.target_amount)}</span>
            <span className="hidden sm:inline">{formatCurrency(goal.target_amount)}</span>
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-text-tertiary">Allocated</p>
          <p className="ledger-figure whitespace-nowrap text-sm font-medium" style={{ color }}>
            <span className="sm:hidden">{formatCurrencyCompact(effectiveAmount)}</span>
            <span className="hidden sm:inline">{formatCurrency(effectiveAmount)}</span>
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-text-tertiary">Remaining</p>
          <p className="ledger-figure whitespace-nowrap text-sm font-medium text-foreground">
            <span className="sm:hidden">{formatCurrencyCompact(remaining)}</span>
            <span className="hidden sm:inline">{formatCurrency(remaining)}</span>
          </p>
        </div>
      </div>

      {/* Funded vs on-pace -- the tick marks where you should be by now */}
      <div className="mt-4">
        <ProgressBar
          value={progressPct}
          color={color}
          height={8}
          target={onPacePct}
          ariaLabel={`${goal.name} progress: ${Math.round(progressPct)} percent funded`}
        />
        {onPacePct !== undefined && (
          <p className="mt-1.5 text-[11px] text-text-tertiary">
            {progressPct >= onPacePct ? (
              <span style={{ color: rawColors.app.green }}>
                {Math.round(progressPct - onPacePct)}% ahead of pace
              </span>
            ) : (
              <span style={{ color: rawColors.app.orange }}>
                {Math.round(onPacePct - progressPct)}% behind pace
              </span>
            )}
            <span> &middot; should be {Math.round(onPacePct)}% by now</span>
          </p>
        )}
      </div>

      {/* Smart Projections */}
      <GoalProjections goal={goal} projection={projection} avgMonthlySavings={avgMonthlySavings} />

      {goal.notes && <p className="mt-3 break-words text-sm text-text-tertiary italic">{goal.notes}</p>}
      <GoalCardActions goal={goal} effectiveAmount={effectiveAmount} {...actions} />
    </motion.div>
  )
}

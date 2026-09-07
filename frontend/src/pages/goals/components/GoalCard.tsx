import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Pencil, Trash2, Edit3 } from 'lucide-react'
import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters'
import { parseLocalDate } from '@/lib/dateUtils'
import { Button, ConfirmDialog } from '@/components/ui'
import { ProgressBar } from '@/components/shared'
import { rawColors } from '@/constants/colors'
import { goalTypeColor, goalTypeLabel } from '../constants'
import type { GoalProjection } from '../types'
import { differenceInMonths } from '../helpers'
import CircularProgress from './CircularProgress'
import GoalProjections from './GoalProjections'
import UpdateProgressForm from './UpdateProgressForm'
import EditGoalForm from './EditGoalForm'

export default function GoalCard({
  goal,
  effectiveAmount,
  projection,
  avgMonthlySavings,
  isEditing,
  isEditingDetails,
  onStartEdit,
  onStartEditDetails,
  onSaveAllocation,
  onSaveDetails,
  onCancelEdit,
  onDelete,
}: Readonly<{
  goal: FinancialGoal
  effectiveAmount: number
  projection: GoalProjection
  avgMonthlySavings: number | null
  isEditing: boolean
  isEditingDetails: boolean
  onStartEdit: () => void
  onStartEditDetails: () => void
  onSaveAllocation: (goalId: number, amount: number) => void
  onSaveDetails: (goalId: number, updates: { name: string; target_amount: number; target_date: string }) => void
  onCancelEdit: () => void
  onDelete: (goalId: number) => void
}>) {
  const [confirmDelete, setConfirmDelete] = useState(false)
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

      {/* Footer with Update Progress button */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          type="button"
          onClick={onStartEdit}
          variant="secondary"
          size="sm"
          icon={<Pencil className="h-3.5 w-3.5" />}
        >
          Update Progress
        </Button>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            onClick={onStartEditDetails}
            title="Edit goal"
            aria-label="Edit goal"
            variant="ghost"
            size="sm"
            icon={<Edit3 className="h-3.5 w-3.5" />}
            className="text-text-tertiary hover:text-foreground"
          />
          <Button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title="Delete goal"
            aria-label={`Delete goal: ${goal.name}`}
            variant="ghost"
            size="sm"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            className="text-text-tertiary hover:bg-app-red/10 hover:text-app-red"
          />
        </div>
      </div>
      <span className="mt-2 block text-xs text-text-tertiary">
        Remaining: {formatCurrencyCompact(remaining)}
      </span>

      {goal.notes && <p className="mt-3 text-xs text-text-tertiary italic">{goal.notes}</p>}

      {/* Inline Edit Forms */}
      <AnimatePresence>
        {isEditing && (
          <UpdateProgressForm
            goalId={goal.id}
            currentAmount={effectiveAmount}
            targetAmount={goal.target_amount}
            onSave={onSaveAllocation}
            onCancel={onCancelEdit}
          />
        )}
        {isEditingDetails && (
          <EditGoalForm
            goal={goal}
            onSave={onSaveDetails}
            onCancel={onCancelEdit}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this goal?"
        description={`"${goal.name}" will be permanently removed. This can't be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => onDelete(goal.id)}
      />
    </motion.div>
  )
}

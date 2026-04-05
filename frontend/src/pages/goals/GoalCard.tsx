import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Trash2, Edit3 } from 'lucide-react'
import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters'
import { GOAL_TYPE_COLORS, GOAL_TYPE_LABELS } from './constants'
import type { GoalProjection } from './types'
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
  const color = GOAL_TYPE_COLORS[goal.goal_type]
  const progressPct = goal.target_amount > 0 ? (effectiveAmount / goal.target_amount) * 100 : 0
  const remaining = Math.max(0, goal.target_amount - effectiveAmount)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-4 md:p-6 hover:scale-[1.01] transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-lg font-semibold text-white truncate">{goal.name}</h4>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={onStartEditDetails}
                title="Edit goal"
                className="p-1.5 rounded-lg text-text-tertiary hover:text-white hover:bg-white/10 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(goal.id)}
                title="Delete goal"
                className="p-1.5 rounded-lg text-text-tertiary hover:text-ios-red hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <span
            className="inline-block mt-1 px-2.5 py-0.5 text-xs rounded-full font-medium"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {GOAL_TYPE_LABELS[goal.goal_type]}
          </span>
        </div>
        <div className="relative flex items-center justify-center flex-shrink-0 ml-3">
          <CircularProgress progress={progressPct} color={color} />
          <span className="absolute text-sm font-bold text-white">{Math.round(progressPct)}%</span>
        </div>
      </div>

      {/* Amount Details */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-5">
        <div>
          <p className="text-xs text-text-tertiary">Target</p>
          <p className="text-sm font-medium text-white">{formatCurrency(goal.target_amount)}</p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary">Allocated</p>
          <p className="text-sm font-medium" style={{ color }}>
            {formatCurrency(effectiveAmount)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary">Remaining</p>
          <p className="text-sm font-medium text-foreground">{formatCurrency(remaining)}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-4">
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progressPct, 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>
      </div>

      {/* Smart Projections */}
      <GoalProjections goal={goal} projection={projection} avgMonthlySavings={avgMonthlySavings} />

      {/* Footer with Update Progress button */}
      <div className="flex items-center justify-between mt-4">
        <button
          onClick={onStartEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-white/5 border border-border hover:bg-white/10 text-text-secondary hover:text-white"
        >
          <Pencil className="w-3.5 h-3.5" /> Update Progress
        </button>
        <span className="text-xs text-text-tertiary">
          Remaining: {formatCurrencyCompact(remaining)}
        </span>
      </div>

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
    </motion.div>
  )
}

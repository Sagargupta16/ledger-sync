import { useState, useMemo, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target,
  Plus,
  Trophy,
  Clock,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Pencil,
  Save,
  X,
  PiggyBank,
  Trash2,
  Edit3,
} from 'lucide-react'
import { PageHeader, StatCard } from '@/components/ui'
import { useGoals, useCreateGoal, useMonthlySummaries } from '@/hooks/api/useAnalyticsV2'
import { useTotals } from '@/hooks/api/useAnalytics'
import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { toast } from 'sonner'
import EmptyState from '@/components/shared/EmptyState'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOCATION_STORAGE_KEY = 'ledger-sync-goal-allocations'
const DELETED_GOALS_STORAGE_KEY = 'ledger-sync-deleted-goals'
const GOAL_OVERRIDES_STORAGE_KEY = 'ledger-sync-goal-overrides'

const GOAL_TYPE_COLORS: Record<FinancialGoal['goal_type'], string> = {
  savings: rawColors.ios.green,
  debt_payoff: rawColors.ios.red,
  investment: rawColors.ios.blue,
  expense_reduction: rawColors.ios.orange,
  income_increase: rawColors.ios.purple,
  custom: rawColors.ios.teal,
}

const GOAL_TYPE_LABELS: Record<FinancialGoal['goal_type'], string> = {
  savings: 'Savings',
  debt_payoff: 'Debt Payoff',
  investment: 'Investment',
  expense_reduction: 'Expense Reduction',
  income_increase: 'Income Increase',
  custom: 'Custom',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Difference in months between two dates (fractional). */
function differenceInMonths(later: Date, earlier: Date): number {
  const yearDiff = later.getFullYear() - earlier.getFullYear()
  const monthDiff = later.getMonth() - earlier.getMonth()
  const dayFraction = (later.getDate() - earlier.getDate()) / 30
  return yearDiff * 12 + monthDiff + dayFraction
}

/** Add N months to a date (returns new Date). */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  const wholeMonths = Math.floor(months)
  const dayFraction = months - wholeMonths
  result.setMonth(result.getMonth() + wholeMonths)
  result.setDate(result.getDate() + Math.round(dayFraction * 30))
  return result
}

/** Format a Date as "MMM YYYY". */
function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** Determine the tracking status for a projected date vs. target date. */
function resolveTrackingStatus(
  projected: Date,
  target: Date,
  monthsRemaining: number,
): Pick<GoalProjection, 'status' | 'statusLabel' | 'statusColor' | 'monthsDelta'> {
  const projectedMonths = differenceInMonths(projected, new Date())
  const monthsDelta = monthsRemaining - projectedMonths // positive = ahead

  if (projected <= target) {
    return { status: 'on_track', statusLabel: 'On Track', statusColor: rawColors.ios.green, monthsDelta }
  }
  const monthsBehind = differenceInMonths(projected, target)
  if (monthsBehind <= 3) {
    return { status: 'slightly_behind', statusLabel: 'Slightly Behind', statusColor: rawColors.ios.yellow, monthsDelta }
  }
  return { status: 'behind', statusLabel: 'Behind', statusColor: rawColors.ios.red, monthsDelta }
}

/** Compute the full projection for a single goal. */
function computeGoalProjection(
  goal: FinancialGoal,
  currentAmount: number,
  avgMonthlySavings: number | null,
  now: Date,
): GoalProjection {
  const targetDate = new Date(goal.target_date)
  const monthsRemaining = Math.max(0, differenceInMonths(targetDate, now))

  if (currentAmount >= goal.target_amount) {
    return {
      monthsRemaining,
      requiredMonthlySavings: null,
      projectedDate: null,
      monthsToComplete: null,
      status: 'achieved',
      statusLabel: 'Achieved',
      statusColor: rawColors.ios.green,
      monthsDelta: null,
    }
  }

  const amountRemaining = goal.target_amount - currentAmount
  const requiredMonthlySavings = monthsRemaining > 0 ? amountRemaining / monthsRemaining : null

  if (avgMonthlySavings == null || avgMonthlySavings <= 0) {
    return {
      monthsRemaining,
      requiredMonthlySavings,
      projectedDate: null,
      monthsToComplete: null,
      status: 'no_data',
      statusLabel: 'No savings data',
      statusColor: rawColors.ios.yellow,
      monthsDelta: null,
    }
  }

  const monthsToComplete = amountRemaining / avgMonthlySavings
  const projectedDate = addMonths(now, monthsToComplete)
  const tracking = resolveTrackingStatus(projectedDate, targetDate, monthsRemaining)

  return { monthsRemaining, requiredMonthlySavings, projectedDate, monthsToComplete, ...tracking }
}

/** Read goal allocations from localStorage. */
function loadAllocations(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ALLOCATION_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, number>
  } catch {
    return {}
  }
}

/** Persist goal allocations to localStorage. */
function saveAllocations(allocations: Record<string, number>): void {
  try {
    localStorage.setItem(ALLOCATION_STORAGE_KEY, JSON.stringify(allocations))
  } catch {
    // Storage full or unavailable; ignore
  }
}

/** Read hidden (deleted) goal IDs from localStorage. */
function loadDeletedGoals(): Set<number> {
  try {
    const raw = localStorage.getItem(DELETED_GOALS_STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as number[])
  } catch {
    return new Set()
  }
}

/** Persist hidden (deleted) goal IDs to localStorage. */
function saveDeletedGoals(ids: Set<number>): void {
  try {
    localStorage.setItem(DELETED_GOALS_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage full or unavailable; ignore
  }
}

type GoalOverride = { name: string; target_amount: number; target_date: string }

/** Read goal overrides from localStorage. */
function loadGoalOverrides(): Record<number, GoalOverride> {
  try {
    const raw = localStorage.getItem(GOAL_OVERRIDES_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<number, GoalOverride>
  } catch {
    return {}
  }
}

/** Persist goal overrides to localStorage. */
function saveGoalOverrides(overrides: Record<number, GoalOverride>): void {
  try {
    localStorage.setItem(GOAL_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // Storage full or unavailable; ignore
  }
}

// ---------------------------------------------------------------------------
// Projection types
// ---------------------------------------------------------------------------

interface GoalProjection {
  monthsRemaining: number
  requiredMonthlySavings: number | null
  projectedDate: Date | null
  monthsToComplete: number | null
  status: 'achieved' | 'on_track' | 'slightly_behind' | 'behind' | 'no_data'
  statusLabel: string
  statusColor: string
  monthsDelta: number | null // positive = ahead of schedule
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CircularProgress({
  progress,
  color,
  size = 80,
}: Readonly<{ progress: number; color: string; size?: number }>) {
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-colors duration-700 ease-out"
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Savings Pool Summary
// ---------------------------------------------------------------------------

function SavingsPoolSummary({
  netSavings,
  totalAllocated,
  goals,
  effectiveAmounts,
}: Readonly<{
  netSavings: number
  totalAllocated: number
  goals: FinancialGoal[]
  effectiveAmounts: Record<number, number>
}>) {
  const unallocated = netSavings - totalAllocated

  // Build colored segments for the allocation bar
  const segments = useMemo(() => {
    if (netSavings <= 0) return []
    return goals
      .filter((g) => (effectiveAmounts[g.id] ?? 0) > 0)
      .map((g) => ({
        id: g.id,
        name: g.name,
        amount: effectiveAmounts[g.id] ?? 0,
        pct: Math.min(((effectiveAmounts[g.id] ?? 0) / netSavings) * 100, 100),
        color: GOAL_TYPE_COLORS[g.goal_type],
      }))
  }, [goals, effectiveAmounts, netSavings])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl"
          style={{ backgroundColor: `${rawColors.ios.purple}20` }}
        >
          <PiggyBank className="w-5 h-5" style={{ color: rawColors.ios.purple }} />
        </div>
        <h3 className="text-lg font-semibold text-white">Savings Pool</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-text-tertiary mb-1">Total Net Savings</p>
          <p className="text-xl font-bold text-white">{formatCurrencyCompact(netSavings)}</p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary mb-1">Total Allocated</p>
          <p className="text-xl font-bold" style={{ color: rawColors.ios.blue }}>
            {formatCurrencyCompact(totalAllocated)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary mb-1">Unallocated</p>
          <p
            className="text-xl font-bold"
            style={{ color: unallocated >= 0 ? rawColors.ios.green : rawColors.ios.red }}
          >
            {formatCurrencyCompact(unallocated)}
          </p>
        </div>
      </div>

      {/* Allocation bar */}
      {netSavings > 0 && (
        <div>
          <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden flex">
            {segments.map((seg) => (
              <motion.div
                key={seg.id}
                initial={{ width: 0 }}
                animate={{ width: `${seg.pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ backgroundColor: seg.color }}
                title={`${seg.name}: ${formatCurrencyCompact(seg.amount)}`}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {segments.map((seg) => (
              <div key={seg.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: seg.color }} />
                {seg.name} ({seg.pct.toFixed(0)}%)
              </div>
            ))}
            {unallocated > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <span className="w-2.5 h-2.5 rounded-full inline-block bg-white/10" />
                Unallocated ({((unallocated / netSavings) * 100).toFixed(0)}%)
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Feasibility Warning
// ---------------------------------------------------------------------------

function FeasibilityWarning({
  totalAllocated,
  netSavings,
}: Readonly<{ totalAllocated: number; netSavings: number }>) {
  if (totalAllocated <= netSavings || netSavings <= 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-xl border px-4 py-3"
      style={{
        borderColor: `${rawColors.ios.orange}40`,
        backgroundColor: `${rawColors.ios.orange}08`,
      }}
    >
      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: rawColors.ios.orange }} />
      <div className="text-sm">
        <span className="font-medium text-white">Goal allocations exceed savings. </span>
        <span className="text-text-secondary">
          Your goal allocations ({formatCurrencyCompact(totalAllocated)}) exceed your total net savings (
          {formatCurrencyCompact(netSavings)}). Consider adjusting your goals or increasing savings.
        </span>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Inline Update Progress Form
// ---------------------------------------------------------------------------

function UpdateProgressForm({
  goalId,
  currentAmount,
  targetAmount,
  onSave,
  onCancel,
}: Readonly<{
  goalId: number
  currentAmount: number
  targetAmount: number
  onSave: (goalId: number, amount: number) => void
  onCancel: () => void
}>) {
  const [value, setValue] = useState(String(currentAmount))

  const handleSave = () => {
    const numValue = Number(value)
    if (Number.isNaN(numValue) || numValue < 0) {
      toast.error('Please enter a valid positive amount')
      return
    }
    if (numValue > targetAmount) {
      toast.error(`Amount cannot exceed target (${formatCurrencyCompact(targetAmount)})`)
      return
    }
    onSave(goalId, numValue)
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-3">
        <div className="flex-1">
          <label htmlFor={`allocation-${goalId}`} className="text-xs text-text-tertiary mb-1 block">Allocated Amount</label>
          <input
            id={`allocation-${goalId}`}
            type="number"
            min={0}
            max={targetAmount}
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            autoFocus
          />
        </div>
        <div className="flex gap-2 pt-4">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${rawColors.ios.green}, ${rawColors.ios.teal})` }}
          >
            <Save className="w-3.5 h-3.5" /> Save
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-muted-foreground bg-white/5 border border-border hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Inline Edit Goal Form
// ---------------------------------------------------------------------------

function EditGoalForm({
  goal,
  onSave,
  onCancel,
}: Readonly<{
  goal: FinancialGoal
  onSave: (goalId: number, updates: { name: string; target_amount: number; target_date: string }) => void
  onCancel: () => void
}>) {
  const [name, setName] = useState(goal.name)
  const [targetAmount, setTargetAmount] = useState(String(goal.target_amount))
  const [targetDate, setTargetDate] = useState(goal.target_date.slice(0, 10))

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Goal name is required')
      return
    }
    const numAmount = Number(targetAmount)
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid positive target amount')
      return
    }
    if (!targetDate) {
      toast.error('Target date is required')
      return
    }
    onSave(goal.id, { name: name.trim(), target_amount: numAmount, target_date: targetDate })
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
        <div>
          <label htmlFor={`edit-name-${goal.id}`} className="text-xs text-text-tertiary mb-1 block">Goal Name</label>
          <input
            id={`edit-name-${goal.id}`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`edit-amount-${goal.id}`} className="text-xs text-text-tertiary mb-1 block">Target Amount</label>
            <input
              id={`edit-amount-${goal.id}`}
              type="number"
              min={0}
              step="any"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            />
          </div>
          <div>
            <label htmlFor={`edit-date-${goal.id}`} className="text-xs text-text-tertiary mb-1 block">Target Date</label>
            <input
              id={`edit-date-${goal.id}`}
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})` }}
          >
            <Save className="w-3.5 h-3.5" /> Save Changes
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-muted-foreground bg-white/5 border border-border hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Goal Card
// ---------------------------------------------------------------------------

function GoalCard({
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
      className="glass rounded-2xl border border-border p-6 hover:scale-[1.01] transition-all duration-300"
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
      <div className="grid grid-cols-3 gap-4 mt-5">
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
      <div className="mt-4 space-y-1.5">
        {avgMonthlySavings != null && avgMonthlySavings > 0 && projection.projectedDate && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: rawColors.ios.blue }} />
            <span>
              At {formatCurrencyCompact(avgMonthlySavings)}/mo savings{' '}
              {projection.status === 'achieved' ? (
                <span className="font-medium" style={{ color: rawColors.ios.green }}>
                  -- Goal achieved!
                </span>
              ) : (
                <>
                  &#8594; {formatMonthYear(projection.projectedDate)}
                </>
              )}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: rawColors.ios.teal }} />
          <span>
            Target: {new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            {projection.monthsRemaining > 0 && (
              <span className="text-text-tertiary"> ({Math.ceil(projection.monthsRemaining)} months left)</span>
            )}
          </span>
        </div>

        {projection.requiredMonthlySavings != null && projection.requiredMonthlySavings > 0 && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Target className="w-3.5 h-3.5 flex-shrink-0" style={{ color: rawColors.ios.orange }} />
            <span>
              Needs {formatCurrencyCompact(projection.requiredMonthlySavings)}/mo to reach target on time
            </span>
          </div>
        )}

        {/* Status Badge */}
        <div className="flex items-center gap-2 text-xs">
          {projection.status === 'achieved' ? (
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: rawColors.ios.green }} />
          ) : (
            <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: projection.statusColor }} />
          )}
          <span className="font-medium" style={{ color: projection.statusColor }}>
            {projection.statusLabel}
          </span>
          {projection.monthsDelta != null && projection.status !== 'achieved' && projection.status !== 'no_data' && (
            <span className="text-text-tertiary">
              {projection.monthsDelta > 0
                ? `-- ${Math.round(projection.monthsDelta)} months ahead`
                : `-- ${Math.round(Math.abs(projection.monthsDelta))} months behind`}
            </span>
          )}
        </div>
      </div>

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

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function GoalsPage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null)
  const [editingDetailsGoalId, setEditingDetailsGoalId] = useState<number | null>(null)
  const [allocations, setAllocations] = useState<Record<string, number>>(loadAllocations)
  const [deletedGoalIds, setDeletedGoalIds] = useState<Set<number>>(loadDeletedGoals)
  const [goalOverrides, setGoalOverrides] = useState<Record<number, GoalOverride>>(loadGoalOverrides)
  const [formData, setFormData] = useState({
    name: '',
    goal_type: 'savings',
    target_amount: '',
    target_date: '',
    notes: '',
  })

  const { data: rawGoals = [], isLoading: goalsLoading } = useGoals({ include_achieved: true })

  // Filter out locally-deleted goals and apply local overrides
  const goals = useMemo(
    () =>
      rawGoals
        .filter((g) => !deletedGoalIds.has(g.id))
        .map((g) => {
          const override = goalOverrides[g.id]
          if (!override) return g
          return { ...g, name: override.name, target_amount: override.target_amount, target_date: override.target_date }
        }),
    [rawGoals, deletedGoalIds, goalOverrides],
  )
  const createGoal = useCreateGoal()
  const { data: totals, isLoading: totalsLoading } = useTotals()
  const { data: monthlySummaries = [] } = useMonthlySummaries()

  const isLoading = goalsLoading

  // Sync allocations from localStorage on mount
  useEffect(() => {
    setAllocations(loadAllocations())
  }, [])

  // Calculate effective amounts (max of backend + localStorage)
  const effectiveAmounts = useMemo(() => {
    const map: Record<number, number> = {}
    for (const goal of goals) {
      const localAmount = allocations[String(goal.id)] ?? 0
      map[goal.id] = Math.max(goal.current_amount, localAmount)
    }
    return map
  }, [goals, allocations])

  // Net savings from totals
  const netSavings = totals?.net_savings ?? 0

  // Average monthly savings from monthly summaries
  const avgMonthlySavings = useMemo(() => {
    if (monthlySummaries.length === 0) return null
    const totalSavings = monthlySummaries.reduce((sum, m) => sum + m.savings.net, 0)
    return totalSavings / monthlySummaries.length
  }, [monthlySummaries])

  // Total allocated across all goals
  const totalAllocated = useMemo(() => {
    return goals.reduce((sum, g) => sum + (effectiveAmounts[g.id] ?? 0), 0)
  }, [goals, effectiveAmounts])

  // Summary counts
  const summary = useMemo(() => {
    const achieved = goals.filter(
      (g) => g.is_achieved || (effectiveAmounts[g.id] ?? 0) >= g.target_amount,
    ).length
    return { total: goals.length, achieved, inProgress: goals.length - achieved }
  }, [goals, effectiveAmounts])

  // Compute projections for each goal
  const projections = useMemo(() => {
    const now = new Date()
    const map: Record<number, GoalProjection> = {}

    for (const goal of goals) {
      map[goal.id] = computeGoalProjection(goal, effectiveAmounts[goal.id] ?? 0, avgMonthlySavings, now)
    }

    return map
  }, [goals, effectiveAmounts, avgMonthlySavings])

  // Sort goals: soonest deadline first, achieved goals at the bottom
  const sortedGoals = useMemo(() => {
    return [...goals].sort((a, b) => {
      const aAchieved = a.is_achieved || (effectiveAmounts[a.id] ?? 0) >= a.target_amount
      const bAchieved = b.is_achieved || (effectiveAmounts[b.id] ?? 0) >= b.target_amount

      // Achieved goals go to the bottom
      if (aAchieved && !bAchieved) return 1
      if (!aAchieved && bAchieved) return -1

      // Sort by target_date ascending (soonest first)
      return new Date(a.target_date).getTime() - new Date(b.target_date).getTime()
    })
  }, [goals, effectiveAmounts])

  // Handlers
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!formData.name || !formData.target_amount || !formData.target_date) {
        toast.error('Please fill in required fields')
        return
      }

      createGoal.mutate(
        {
          name: formData.name,
          goal_type: formData.goal_type,
          target_amount: Number(formData.target_amount),
          target_date: formData.target_date,
          notes: formData.notes || undefined,
        },
        {
          onSuccess: () => {
            toast.success('Goal created successfully')
            setShowCreateForm(false)
            setFormData({ name: '', goal_type: 'savings', target_amount: '', target_date: '', notes: '' })
          },
        },
      )
    },
    [formData, createGoal],
  )

  const handleSaveAllocation = useCallback(
    (goalId: number, amount: number) => {
      const updated = { ...allocations, [String(goalId)]: amount }
      setAllocations(updated)
      saveAllocations(updated)
      setEditingGoalId(null)
      toast.success('Progress updated')
    },
    [allocations],
  )

  const handleCancelEdit = useCallback(() => {
    setEditingGoalId(null)
    setEditingDetailsGoalId(null)
  }, [])

  const handleDeleteGoal = useCallback(
    (goalId: number) => {
      const updated = new Set(deletedGoalIds)
      updated.add(goalId)
      setDeletedGoalIds(updated)
      saveDeletedGoals(updated)
      toast.success('Goal removed')
    },
    [deletedGoalIds],
  )

  const handleSaveDetails = useCallback(
    (goalId: number, updates: { name: string; target_amount: number; target_date: string }) => {
      const updated = { ...goalOverrides, [goalId]: updates }
      setGoalOverrides(updated)
      saveGoalOverrides(updated)
      setEditingDetailsGoalId(null)
      toast.success('Goal updated')
    },
    [goalOverrides],
  )

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
      <PageHeader
        title="Financial Goals"
        subtitle="Track progress toward your financial targets"
        action={
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})` }}
          >
            <Plus className="w-4 h-4" /> Create Goal
          </button>
        }
      />

      {/* Summary Cards */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <motion.div variants={fadeUpItem}>
          <StatCard title="Total Goals" value={String(summary.total)} icon={<Target className="w-5 h-5" />} iconColor={rawColors.ios.blue} />
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <StatCard title="Achieved" value={String(summary.achieved)} icon={<Trophy className="w-5 h-5" />} iconColor={rawColors.ios.green} />
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <StatCard title="In Progress" value={String(summary.inProgress)} icon={<Clock className="w-5 h-5" />} iconColor={rawColors.ios.orange} />
        </motion.div>
      </motion.div>

      {/* Savings Pool Summary */}
      {!totalsLoading && totals && goals.length > 0 && (
        <SavingsPoolSummary
          netSavings={netSavings}
          totalAllocated={totalAllocated}
          goals={goals}
          effectiveAmounts={effectiveAmounts}
        />
      )}

      {/* Feasibility Warning */}
      {goals.length > 0 && netSavings > 0 && (
        <FeasibilityWarning totalAllocated={totalAllocated} netSavings={netSavings} />
      )}

      {/* Create Form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleSubmit} className="glass rounded-2xl border border-border p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Create New Goal</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Goal name *"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
                />
                <select
                  value={formData.goal_type}
                  onChange={(e) => setFormData({ ...formData, goal_type: e.target.value })}
                  className="px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
                >
                  <option value="savings">Savings</option>
                  <option value="debt_payoff">Debt Payoff</option>
                  <option value="investment">Investment</option>
                  <option value="expense_reduction">Expense Reduction</option>
                  <option value="income_increase">Income Increase</option>
                  <option value="custom">Custom</option>
                </select>
                <input
                  type="number"
                  placeholder="Target amount *"
                  value={formData.target_amount}
                  onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })}
                  className="px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
                />
                <input
                  type="date"
                  value={formData.target_date}
                  onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                  className="px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
                />
              </div>
              <input
                type="text"
                placeholder="Notes (optional)"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={createGoal.isPending}
                  className="px-5 py-2 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})` }}
                >
                  {createGoal.isPending ? 'Creating...' : 'Create Goal'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-5 py-2 rounded-xl text-sm text-muted-foreground bg-white/5 border border-border hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Goals Grid */}
      {isLoading && (
        <div className="h-64 flex items-center justify-center text-muted-foreground">Loading goals...</div>
      )}
      {!isLoading && goals.length === 0 && (
        <EmptyState
          icon={Target}
          title="No financial goals yet"
          description="Create your first goal to start tracking your financial progress."
        />
      )}
      {!isLoading && goals.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sortedGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              effectiveAmount={effectiveAmounts[goal.id] ?? goal.current_amount}
              projection={
                projections[goal.id] ?? {
                  monthsRemaining: 0,
                  requiredMonthlySavings: null,
                  projectedDate: null,
                  monthsToComplete: null,
                  status: 'no_data' as const,
                  statusLabel: 'No data',
                  statusColor: rawColors.ios.yellow,
                  monthsDelta: null,
                }
              }
              avgMonthlySavings={avgMonthlySavings}
              isEditing={editingGoalId === goal.id}
              isEditingDetails={editingDetailsGoalId === goal.id}
              onStartEdit={() => { setEditingGoalId(goal.id); setEditingDetailsGoalId(null) }}
              onStartEditDetails={() => { setEditingDetailsGoalId(goal.id); setEditingGoalId(null) }}
              onSaveAllocation={handleSaveAllocation}
              onSaveDetails={handleSaveDetails}
              onCancelEdit={handleCancelEdit}
              onDelete={handleDeleteGoal}
            />
          ))}
        </div>
      )}
    </div>
  )
}

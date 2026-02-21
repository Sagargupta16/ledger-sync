import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Target, Plus, Trophy, Clock, CheckCircle } from 'lucide-react'
import { PageHeader, StatCard } from '@/components/ui'
import { useGoals, useCreateGoal } from '@/hooks/api/useAnalyticsV2'
import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { toast } from 'sonner'
import EmptyState from '@/components/shared/EmptyState'

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

function CircularProgress({ progress, color, size = 80 }: Readonly<{ progress: number; color: string; size?: number }>) {
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

export default function GoalsPage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    goal_type: 'savings',
    target_amount: '',
    target_date: '',
    notes: '',
  })

  const { data: goals = [], isLoading } = useGoals({ include_achieved: true })
  const createGoal = useCreateGoal()

  const summary = useMemo(() => {
    const achieved = goals.filter((g) => g.is_achieved).length
    return { total: goals.length, achieved, inProgress: goals.length - achieved }
  }, [goals])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
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

  const getOnTrackStatus = (goal: FinancialGoal) => {
    if (goal.is_achieved) return { label: 'Achieved', color: rawColors.ios.green }
    const now = new Date()
    const start = new Date(goal.start_date)
    const end = new Date(goal.target_date)
    const totalDuration = end.getTime() - start.getTime()
    if (totalDuration <= 0) return { label: 'Past Due', color: rawColors.ios.red }
    const elapsed = now.getTime() - start.getTime()
    const expectedProgress = Math.min(100, (elapsed / totalDuration) * 100)
    if (goal.progress_pct >= expectedProgress - 5) return { label: 'On Track', color: rawColors.ios.green }
    if (goal.progress_pct >= expectedProgress - 20) return { label: 'Slightly Behind', color: rawColors.ios.yellow }
    return { label: 'Behind', color: rawColors.ios.red }
  }

  return (
    <div className="p-8 space-y-8">
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
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
                  className="px-5 py-2 rounded-xl text-sm font-medium text-white bg-ios-green hover:bg-ios-green transition-colors disabled:opacity-50"
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
          {goals.map((goal) => {
            const color = GOAL_TYPE_COLORS[goal.goal_type]
            const status = getOnTrackStatus(goal)
            const remaining = Math.max(0, goal.target_amount - goal.current_amount)

            return (
              <motion.div
                key={goal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-2xl border border-border p-6"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-white">{goal.name}</h4>
                    <span
                      className="inline-block mt-1 px-2.5 py-0.5 text-xs rounded-full font-medium"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      {GOAL_TYPE_LABELS[goal.goal_type]}
                    </span>
                  </div>
                  <div className="relative flex items-center justify-center">
                    <CircularProgress progress={goal.progress_pct} color={color} />
                    <span className="absolute text-sm font-bold text-white">
                      {Math.round(goal.progress_pct)}%
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-3 gap-4 mt-5">
                  <div>
                    <p className="text-xs text-text-tertiary">Target</p>
                    <p className="text-sm font-medium text-white">{formatCurrency(goal.target_amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-tertiary">Current</p>
                    <p className="text-sm font-medium" style={{ color }}>{formatCurrency(goal.current_amount)}</p>
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
                      animate={{ width: `${Math.min(goal.progress_pct, 100)}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    {goal.is_achieved ? (
                      <CheckCircle className="w-4 h-4 text-ios-green" />
                    ) : (
                      <Clock className="w-4 h-4 text-text-tertiary" />
                    )}
                    <span className="text-xs" style={{ color: status.color }}>
                      {status.label}
                    </span>
                  </div>
                  <span className="text-xs text-text-tertiary">
                    Target: {new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>

                {goal.notes && (
                  <p className="mt-3 text-xs text-text-tertiary italic">{goal.notes}</p>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { motion, AnimatePresence } from 'framer-motion'
import { Target, Plus, Trophy, Clock } from 'lucide-react'
import { PageContainer, PageHeader, StatCard } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import EmptyState from '@/components/shared/EmptyState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'

import useGoalsState from './useGoalsState'
import SavingsPoolSummary from './components/SavingsPoolSummary'
import FeasibilityWarning from './components/FeasibilityWarning'
import CreateGoalForm from './components/CreateGoalForm'
import GoalCard from './components/GoalCard'

const DEFAULT_PROJECTION = {
  monthsRemaining: 0,
  requiredMonthlySavings: null,
  projectedDate: null,
  monthsToComplete: null,
  status: 'no_data' as const,
  statusLabel: 'No data',
  statusColor: rawColors.app.yellow,
  monthsDelta: null,
}

export default function GoalsPage() {
  const state = useGoalsState()

  return (
    <PageContainer>
      <PageHeader
        title="Financial Goals"
        subtitle="Track progress toward your financial targets"
        action={
          <button
            onClick={() => state.setShowCreateForm(!state.showCreateForm)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-on-accent transition-colors hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${rawColors.app.blue}, ${rawColors.app.indigo})` }}
          >
            <Plus className="w-4 h-4" /> Create Goal
          </button>
        }
      />

      {/* Summary Cards */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-5">
        <motion.div variants={fadeUpItem}>
          <StatCard title="Total Goals" value={String(state.summary.total)} icon={<Target className="w-5 h-5" />} iconColor={rawColors.app.blue} />
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <StatCard title="Achieved" value={String(state.summary.achieved)} icon={<Trophy className="w-5 h-5" />} iconColor={rawColors.app.green} />
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <StatCard title="In Progress" value={String(state.summary.inProgress)} icon={<Clock className="w-5 h-5" />} iconColor={rawColors.app.orange} />
        </motion.div>
      </motion.div>

      {/* Achieved vs in-progress completion strip (reuses summary counts) */}
      {state.summary.total > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full overflow-hidden bg-[var(--overlay-3)] flex">
            {state.summary.achieved > 0 && (
              <div
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${(state.summary.achieved / state.summary.total) * 100}%`,
                  backgroundColor: rawColors.app.green,
                }}
                title={`Achieved: ${state.summary.achieved}`}
              />
            )}
            {state.summary.inProgress > 0 && (
              <div
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${(state.summary.inProgress / state.summary.total) * 100}%`,
                  backgroundColor: rawColors.app.orange,
                }}
                title={`In progress: ${state.summary.inProgress}`}
              />
            )}
          </div>
          <span className="text-xs font-medium text-text-secondary whitespace-nowrap">
            {Math.round((state.summary.achieved / state.summary.total) * 100)}% achieved
          </span>
        </div>
      )}

      {!state.totalsLoading && state.totals && state.goals.length > 0 && (
        <SavingsPoolSummary
          netSavings={state.netSavings}
          totalAllocated={state.totalAllocated}
          goals={state.goals}
          effectiveAmounts={state.effectiveAmounts}
        />
      )}

      {state.goals.length > 0 && state.netSavings > 0 && (
        <FeasibilityWarning totalAllocated={state.totalAllocated} netSavings={state.netSavings} />
      )}

      <AnimatePresence>
        {state.showCreateForm && (
          <CreateGoalForm
            formData={state.formData}
            isPending={state.createGoalPending}
            onFormDataChange={state.setFormData}
            onSubmit={state.handleSubmit}
            onCancel={() => state.setShowCreateForm(false)}
          />
        )}
      </AnimatePresence>

      {state.isLoading && <PageSkeleton />}
      {!state.isLoading && state.goals.length === 0 && (
        <EmptyState
          icon={Target}
          title="No financial goals yet"
          description="Create your first goal to start tracking your financial progress."
        />
      )}
      {!state.isLoading && state.goals.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {state.sortedGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              effectiveAmount={state.effectiveAmounts[goal.id] ?? goal.current_amount}
              projection={state.projections[goal.id] ?? DEFAULT_PROJECTION}
              avgMonthlySavings={state.avgMonthlySavings}
              isEditing={state.editingGoalId === goal.id}
              isEditingDetails={state.editingDetailsGoalId === goal.id}
              onStartEdit={() => { state.setEditingGoalId(goal.id); state.setEditingDetailsGoalId(null) }}
              onStartEditDetails={() => { state.setEditingDetailsGoalId(goal.id); state.setEditingGoalId(null) }}
              onSaveAllocation={state.handleSaveAllocation}
              onSaveDetails={state.handleSaveDetails}
              onCancelEdit={state.handleCancelEdit}
              onDelete={state.handleDeleteGoal}
            />
          ))}
        </div>
      )}
    </PageContainer>
  )
}

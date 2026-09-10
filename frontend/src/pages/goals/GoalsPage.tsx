import { AnimatePresence } from 'motion/react'
import { Target, Plus, Trophy, Clock, X } from 'lucide-react'
import { Button, PageContainer, PageHeader, StatCard } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import EmptyState from '@/components/shared/EmptyState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import PageErrorState from '@/components/shared/PageErrorState'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'

import useGoalsState from './useGoalsState'
import SavingsPoolSummary from './components/SavingsPoolSummary'
import FeasibilityWarning from './components/FeasibilityWarning'
import CreateGoalForm from './components/CreateGoalForm'
import GoalCard from './components/GoalCard'
import LegacyGoalRecovery from './components/LegacyGoalRecovery'

const DEFAULT_PROJECTION = {
  monthsRemaining: 0,
  deadlineState: 'none' as const,
  requiredMonthlySavings: null,
  projectedDate: null,
  monthsToComplete: null,
  status: 'no_data' as const,
  statusLabel: 'No data',
  statusColor: rawColors.app.yellow,
  monthsDelta: null,
}

export default function GoalsPage() {
  const userId = useAuthStore((state) => state.user?.id)
  const isDemoMode = useDemoStore((state) => state.isDemoMode)

  return <GoalsContent key={isDemoMode ? 'demo' : `user-${userId ?? 'none'}`} />
}

function GoalsContent() {
  const state = useGoalsState()

  if (state.isLoading) return <PageSkeleton />

  if (state.isError) {
    return (
      <PageErrorState
        title="Financial Goals"
        subtitle="Track progress toward your financial targets"
        onRetry={state.retry}
      />
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Financial Goals"
        subtitle="Track progress toward your financial targets"
        action={
          <Button
            type="button"
            onClick={() => state.setShowCreateForm(!state.showCreateForm)}
            variant={state.showCreateForm ? 'secondary' : 'primary'}
            icon={
              state.showCreateForm ? (
                <X className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )
            }
            aria-expanded={state.showCreateForm}
            disabled={state.createGoalPending || state.recovery.pendingGoalId !== null}
          >
            {state.showCreateForm ? 'Close form' : 'Create Goal'}
          </Button>
        }
      />

      {state.isDemoMode && (
        <p role="status" className="rounded-lg border border-app-blue/20 bg-app-blue/5 px-4 py-3 text-sm text-text-secondary">
          Try creating, editing, or deleting a goal. Demo changes are temporary and reset when you leave this page or reload.
        </p>
      )}

      {!state.isDemoMode && (
        <LegacyGoalRecovery
          recovery={state.recovery}
          isEditing={state.showCreateForm || state.editingGoalId !== null
            || state.editingDetailsGoalId !== null || state.isGoalMutationPending}
        />
      )}

      <div className="grid grid-cols-1 gap-3 min-[375px]:grid-cols-2 sm:gap-5 md:grid-cols-3">
        <StatCard
          title="Total Goals"
          value={String(state.summary.total)}
          icon={<Target className="h-5 w-5" />}
          iconColor={rawColors.app.blue}
          delay={0}
        />
        <StatCard
          title="Achieved"
          value={String(state.summary.achieved)}
          icon={<Trophy className="h-5 w-5" />}
          iconColor={rawColors.app.green}
          delay={0.04}
        />
        <div className="min-[375px]:col-span-2 md:col-span-1">
          <StatCard
            title="In Progress"
            value={String(state.summary.inProgress)}
            icon={<Clock className="h-5 w-5" />}
            iconColor={rawColors.app.orange}
            delay={0.08}
          />
        </div>
      </div>

      {/* Achieved vs in-progress completion strip (reuses summary counts) */}
      {state.summary.total > 0 && (
        <div
          className="flex items-center gap-3"
          role="img"
          aria-label={`${state.summary.achieved} of ${state.summary.total} goals achieved`}
        >
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
            error={state.createError}
            onFormDataChange={state.setFormData}
            onSubmit={state.handleSubmit}
            onCancel={() => state.setShowCreateForm(false)}
          />
        )}
      </AnimatePresence>

      {state.goals.length === 0 && (
        <EmptyState
          icon={Target}
          title="No financial goals yet"
          description="Create your first goal to start tracking your financial progress."
        />
      )}
      {state.goals.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {state.sortedGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              effectiveAmount={state.effectiveAmounts[goal.id] ?? goal.current_amount}
              projection={state.projections[goal.id] ?? DEFAULT_PROJECTION}
              avgMonthlySavings={state.avgMonthlySavings}
              isEditing={state.editingGoalId === goal.id}
              isEditingDetails={state.editingDetailsGoalId === goal.id}
              isBusy={state.isGoalMutationPending || state.recovery.pendingGoalId !== null}
              isSaving={state.savingGoalId === goal.id}
              isDeleting={state.deletingGoalId === goal.id}
              isDemoMode={state.isDemoMode}
              updateError={state.updateError}
              deleteError={state.deleteErrorGoalId === goal.id ? state.deleteError : null}
              onStartEdit={() => state.startEdit(goal.id, false)}
              onStartEditDetails={() => state.startEdit(goal.id, true)}
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

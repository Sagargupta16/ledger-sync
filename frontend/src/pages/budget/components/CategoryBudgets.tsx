import { useId } from 'react'

import { AnimatePresence, motion } from 'motion/react'
import { Plus, Target, Wallet } from 'lucide-react'
import { toast } from 'sonner'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingSkeleton, { SkeletonStatus } from '@/components/shared/LoadingSkeleton'
import { Button, ConfirmDialog } from '@/components/ui'
import { staggerFast } from '@/constants/animations'
import { getCurrentMonth } from '@/lib/dateUtils'
import { formatDate } from '@/lib/formatters'
import type { Budget } from '@/services/api/analyticsV2'

import { budgetLabel } from '../categoryBudgetUtils'
import { useCategoryBudgets } from '../useCategoryBudgets'
import { BudgetRow } from './BudgetRow'
import { BudgetTotalsBand } from './BudgetTotalsBand'
import CreateBudgetForm from './CreateBudgetForm'

const ADD_DESCRIPTION =
  'Pick an expense category, then set its monthly limit and alert threshold. A paused budget for the same category resumes with these values.'

/**
 * Category budgets on /budgets: this month's spend against each limit, with
 * inline edit, pause or resume, delete, and the same create form Settings uses.
 */
export function CategoryBudgets() {
  const state = useCategoryBudgets()
  const titleId = useId()
  const formId = useId()
  const monthLabel = formatDate(`${getCurrentMonth()}-01`, { month: 'long', year: 'numeric' })
  const { query, active, paused, pendingDelete } = state

  const renderRows = (rows: readonly Budget[]) => (
    <div className="ledger-panel overflow-hidden">
      <motion.ul
        variants={staggerFast}
        initial="hidden"
        animate="visible"
        className="divide-y divide-[var(--hairline-1)]"
      >
        <AnimatePresence>
          {rows.map((budget) => (
            <BudgetRow
              key={budget.id}
              budget={budget}
              isEditing={state.editingId === budget.id}
              isSaving={state.savingId === budget.id}
              isToggling={state.togglingId === budget.id}
              isLocked={state.isBusy}
              editError={state.editingId === budget.id ? state.editError : null}
              onEdit={() => state.startEdit(budget.id)}
              onCancel={state.cancelEdit}
              onSave={(patch) => state.saveEdit(budget, patch)}
              onToggleActive={() => state.toggleActive(budget)}
              onDelete={() => state.requestDelete(budget)}
            />
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  )

  const renderBody = () => {
    if (query.isPending) {
      return (
        <SkeletonStatus className="space-y-3" label="Loading category budgets">
          <LoadingSkeleton className="h-20" />
          <LoadingSkeleton className="h-56" />
        </SkeletonStatus>
      )
    }
    // A failed refetch keeps the rows it had; the inline error above them says so.
    if (query.isError && !query.data) {
      return (
        <ErrorState
          title="Unable to load category budgets"
          message="We could not load your budgets. Your saved limits are unchanged. Try again."
          onRetry={() => void query.refetch()}
          errorType="network"
          variant="card"
        />
      )
    }
    if (active.length === 0 && paused.length === 0) {
      return (
        <EmptyState
          icon={Target}
          title="No category budgets yet"
          description="Set a monthly limit on a spending category to see what is left this month and get an alert before you reach it."
          actionLabel={state.isAdding ? undefined : 'Add budget'}
          onAction={() => state.setIsAdding(true)}
          variant="card"
        />
      )
    }
    return (
      <div className="space-y-4">
        {active.length > 0 ? (
          <>
            <BudgetTotalsBand totals={state.totals} activeCount={active.length} />
            {renderRows(active)}
          </>
        ) : (
          <p className="ledger-panel p-4 text-sm text-muted-foreground">
            No active budgets. Resume a paused one below or add a new budget.
          </p>
        )}
        {paused.length > 0 && (
          <div className="space-y-2">
            <h3 className="ledger-meta text-text-tertiary">Paused ({paused.length})</h3>
            {renderRows(paused)}
          </div>
        )}
      </div>
    )
  }

  return (
    <section aria-labelledby={titleId} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Wallet className="size-4 text-app-blue" aria-hidden="true" />
            Category budgets
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Monthly limits for {monthLabel}. Spending updates after each import.
          </p>
        </div>
        <Button
          icon={<Plus className="size-4" />}
          aria-expanded={state.isAdding}
          aria-controls={formId}
          disabled={state.isAdding}
          onClick={() => state.setIsAdding(true)}
        >
          Add budget
        </Button>
      </div>

      <div id={formId}>
        {state.isAdding && (
          <CreateBudgetForm
            defaultAlertThreshold={state.defaultAlertThreshold}
            description={ADD_DESCRIPTION}
            onCancel={() => state.setIsAdding(false)}
            onCreated={(category) => {
              state.setIsAdding(false)
              toast.success(`Monthly budget saved for ${category}`)
            }}
          />
        )}
      </div>

      {query.isRefetchError && (
        <ErrorState
          message="Could not refresh your budgets. These are the figures from the last successful load."
          onRetry={() => void query.refetch()}
          errorType="network"
          variant="inline"
        />
      )}
      {renderBody()}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) state.setPendingDelete(null)
        }}
        title={`Delete the ${pendingDelete ? budgetLabel(pendingDelete) : ''} budget?`}
        description="This removes its monthly limit and alerts. Your transactions stay unchanged. To stop the alerts but keep the limit, pause it instead. A budget imported from Money Manager comes back with the next backup import while the backup still has it, so pause that one rather than deleting it."
        confirmLabel="Delete budget"
        onConfirm={state.confirmDelete}
      />
    </section>
  )
}

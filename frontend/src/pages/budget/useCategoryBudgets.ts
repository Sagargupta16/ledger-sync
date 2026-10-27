import { useMemo, useState } from 'react'

import { toast } from 'sonner'

import { useAllBudgets, useDeleteBudget, useUpdateBudget } from '@/hooks/api/useBudgetMutations'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import { getApiErrorMessage } from '@/lib/errorUtils'
import type { Budget } from '@/services/api/analyticsV2'
import type { UpdateBudgetRequest } from '@/services/api/analyticsV2Planning'

import { budgetLabel, budgetTotals, splitBudgets } from './categoryBudgetUtils'

/** Shipped default for `default_budget_alert_threshold`. */
const DEFAULT_ALERT_THRESHOLD = 80

/**
 * State and actions for the category budget list on /budgets.
 *
 * One request at a time: while a save, pause or delete is in flight every row's
 * actions wait, so the shared update mutation's `variables` name the busy row.
 * Demo mode keeps every control usable and explains with a toast instead of
 * sending a write the demo adapter would refuse.
 */
export function useCategoryBudgets() {
  const query = useAllBudgets()
  const preferences = usePreferences()
  const update = useUpdateBudget()
  const remove = useDeleteBudget()
  const { guardDemoAction } = useDemoGuard()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Budget | null>(null)

  const { active, paused } = useMemo(() => splitBudgets(query.data ?? []), [query.data])
  const totals = useMemo(() => budgetTotals(active), [active])

  // A pause/resume carries `is_active`; an editor save never does.
  const pending = update.isPending ? update.variables : undefined
  const savingId = pending?.is_active === undefined ? (pending?.id ?? null) : null
  const togglingId = pending?.is_active === undefined ? null : pending.id
  const isBusy = update.isPending || remove.isPending

  const startEdit = (id: number) => {
    if (isBusy) return
    setEditError(null)
    setEditingId(id)
  }

  const cancelEdit = () => {
    if (update.isPending) return
    setEditError(null)
    setEditingId(null)
  }

  const saveEdit = (budget: Budget, patch: UpdateBudgetRequest) => {
    if (isBusy || guardDemoAction('Editing budgets')) return
    if (Object.keys(patch).length === 0) {
      setEditingId(null)
      return
    }
    setEditError(null)
    update.mutate({ id: budget.id, ...patch }, {
      onSuccess: () => {
        setEditingId(null)
        toast.success(`${budgetLabel(budget)} budget saved`)
      },
      onError: (error) => setEditError(getApiErrorMessage(error, 'Could not save the budget. Please try again.')),
    })
  }

  const toggleActive = (budget: Budget) => {
    const resume = budget.is_active === false
    if (isBusy || guardDemoAction(resume ? 'Resuming budgets' : 'Pausing budgets')) return
    const label = budgetLabel(budget)
    update.mutate({ id: budget.id, is_active: resume }, {
      onSuccess: () => toast.success(
        resume ? `${label} budget resumed` : `${label} budget paused. Its alerts stop until you resume it.`,
      ),
      onError: (error) => toast.error(getApiErrorMessage(error, `Could not ${resume ? 'resume' : 'pause'} the budget.`)),
    })
  }

  const requestDelete = (budget: Budget) => {
    if (isBusy || guardDemoAction('Deleting budgets')) return
    setPendingDelete(budget)
  }

  // ConfirmDialog awaits this and then closes, so it must never reject.
  const confirmDelete = async () => {
    const budget = pendingDelete
    if (!budget || remove.isPending) return
    try {
      await remove.mutateAsync(budget.id)
      if (editingId === budget.id) setEditingId(null)
      toast.success(`${budgetLabel(budget)} budget deleted`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not delete the budget. Please try again.'))
    }
  }

  return {
    query,
    active,
    paused,
    totals,
    savingId,
    togglingId,
    isBusy,
    editingId,
    editError,
    isAdding,
    setIsAdding,
    pendingDelete,
    setPendingDelete,
    defaultAlertThreshold: preferences.data?.default_budget_alert_threshold ?? DEFAULT_ALERT_THRESHOLD,
    startEdit,
    cancelEdit,
    saveEdit,
    toggleActive,
    requestDelete,
    confirmDelete,
  }
}

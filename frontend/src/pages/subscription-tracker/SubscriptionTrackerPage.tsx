import { useState, useMemo, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import EmptyState from '@/components/shared/EmptyState'
import PageErrorState from '@/components/shared/PageErrorState'
import { Button, ConfirmDialog, PageContainer, PageHeader } from '@/components/ui'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import {
  useRecurringTransactions,
  useCreateRecurringTransaction,
  useUpdateRecurringTransaction,
  useDeleteRecurringTransaction,
  type RecurringTransactionPatch,
} from '@/hooks/api/useAnalyticsV2'

import { toMonthlyAmount } from './helpers'
import type { RecurringFormData, Suggestion } from './types'
import { AddRecurringForm } from './components/AddRecurringForm'
import QuickAddSuggestions from './components/QuickAddSuggestions'
import RecurringItemsSection from './components/RecurringItemsSection'
import RecurringListSkeleton from './components/RecurringListSkeleton'
import RecurringSummarySection from './components/RecurringSummarySection'

type RecurringUpdate = Omit<RecurringTransactionPatch, 'id'>

export default function SubscriptionTrackerPage() {
  const {
    data: items = [],
    isPending: isLoading,
    isError,
    refetch,
  } = useRecurringTransactions({ active_only: false, min_confidence: 0 })
  const createMutation = useCreateRecurringTransaction()
  const updateMutation = useUpdateRecurringTransaction()
  const deleteMutation = useDeleteRecurringTransaction()

  const [showForm, setShowForm] = useState(false)
  const [suggestion, setSuggestion] = useState<Suggestion | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)

  const confirmed = useMemo(() => items.filter((i) => i.is_confirmed), [items])
  const active = useMemo(
    () =>
      [...confirmed]
        .filter((i) => i.is_active)
        .sort(
          (a, b) =>
            toMonthlyAmount(b.expected_amount, b.frequency) -
            toMonthlyAmount(a.expected_amount, a.frequency),
        ),
    [confirmed],
  )
  const inactive = useMemo(() => confirmed.filter((i) => !i.is_active), [confirmed])

  const summary = useMemo(() => {
    const expenses = active.filter((s) => s.type === 'Expense')
    const incomes = active.filter((s) => s.type === 'Income')
    const monthlyExpense = expenses.reduce((s, i) => s + toMonthlyAmount(i.expected_amount, i.frequency), 0)
    const monthlyIncome = incomes.reduce((s, i) => s + toMonthlyAmount(i.expected_amount, i.frequency), 0)
    const deactivatedExpenseSavings = inactive
      .filter((s) => s.type === 'Expense')
      .reduce((s, i) => s + toMonthlyAmount(i.expected_amount, i.frequency), 0)
    return {
      monthlyExpense,
      monthlyIncome,
      netMonthly: monthlyIncome - monthlyExpense,
      count: active.length,
      deactivatedExpenseSavings,
      deactivatedCount: inactive.filter((s) => s.type === 'Expense').length,
    }
  }, [active, inactive])

  const { guardDemoAction } = useDemoGuard()

  const handleCreate = useCallback((data: RecurringFormData) => {
    if (guardDemoAction('Creating recurring items')) return
    createMutation.mutate(data, {
      onSuccess: () => { toast.success(`Added ${data.name}`); setShowForm(false); setSuggestion(undefined) },
      onError: () => toast.error('Could not add this recurring item'),
    })
  }, [createMutation, guardDemoAction])

  const handleUpdate = useCallback((id: number, patch: RecurringUpdate) => {
    if (guardDemoAction('Editing recurring items')) return
    updateMutation.mutate({ id, ...patch }, {
      onSuccess: () => toast.success('Updated'),
      onError: () => toast.error('Could not update this recurring item'),
    })
  }, [updateMutation, guardDemoAction])

  const handleDelete = useCallback((id: number, name: string) => {
    if (guardDemoAction('Deleting recurring items')) return
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success(`Removed ${name}`),
      onError: () => toast.error('Could not remove this recurring item'),
    })
  }, [deleteMutation, guardDemoAction])

  const openWithSuggestion = (s: Suggestion) => {
    setSuggestion(s)
    setShowForm(true)
  }

  if (isError) {
    return (
      <PageErrorState
        title="Recurring"
        subtitle="Track your regular income and expenses for projected cash flow"
        message="We could not load your recurring transactions. Your saved items are unchanged."
        onRetry={() => { void refetch() }}
      />
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Recurring"
        subtitle="Track your regular income and expenses for projected cash flow"
        action={
          <Button
            type="button"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setSuggestion(undefined)
              setShowForm(true)
            }}
          >
            Add Recurring
          </Button>
        }
      />

      <RecurringSummarySection
        isLoading={isLoading}
        summary={summary}
        hasActiveItems={active.length > 0}
      />

      {!showForm && !isLoading && (
        <QuickAddSuggestions
          compact={confirmed.length > 0}
          onSelect={openWithSuggestion}
        />
      )}

      <AnimatePresence>
        {showForm && (
          <AddRecurringForm
            initial={suggestion}
            onSave={handleCreate}
            onCancel={() => {
              setShowForm(false)
              setSuggestion(undefined)
            }}
            isSaving={createMutation.isPending}
          />
        )}
      </AnimatePresence>

      {!isLoading && (
        <>
          <RecurringItemsSection
            title="Active"
            items={active}
            onUpdate={handleUpdate}
            onDelete={(id, name) => setDeleteTarget({ id, name })}
          />
          <RecurringItemsSection
            title="Inactive"
            items={inactive}
            muted
            onUpdate={handleUpdate}
            onDelete={(id, name) => setDeleteTarget({ id, name })}
          />
        </>
      )}

      {!isLoading && confirmed.length === 0 && !showForm && (
        <EmptyState
          icon={RefreshCw}
          title="No recurring transactions yet"
          description="Add your regular income and bills to project monthly cash flow, or pick one from Quick Add above."
          actionLabel="Add Recurring"
          onAction={() => {
            setSuggestion(undefined)
            setShowForm(true)
          }}
          variant="card"
        />
      )}

      {isLoading && <RecurringListSkeleton />}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete recurring transaction"
        description={`Remove "${deleteTarget?.name ?? ''}"? This stops it from appearing in projected cash flow.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget.id, deleteTarget.name) }}
      />
    </PageContainer>
  )
}

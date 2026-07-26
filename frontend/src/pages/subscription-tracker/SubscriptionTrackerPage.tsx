import { useState, useMemo, useCallback } from 'react'
import { AnimatePresence } from 'motion/react'
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
  type RecurringTransaction,
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

  // Commitments only. The detector also emits `habit` rows -- a lunch bought
  // every week is genuinely periodic but is not a bill, and summing it into
  // "Monthly Expense" would overstate fixed costs.
  //
  // Detected commitments are shown, NOT filtered out. This page used to render
  // only `is_confirmed` rows, so a ledger with dozens of detected bills showed
  // "No recurring transactions yet" -- nothing in the product ever set
  // is_confirmed, so the filter matched nothing by construction.
  const commitments = useMemo(
    () => items.filter((i) => i.pattern_kind !== 'habit'),
    [items],
  )
  const habits = useMemo(() => items.filter((i) => i.pattern_kind === 'habit'), [items])

  const byMonthlyCostDesc = (a: RecurringTransaction, b: RecurringTransaction) =>
    toMonthlyAmount(b.expected_amount, b.frequency) -
    toMonthlyAmount(a.expected_amount, a.frequency)

  const active = useMemo(
    () => commitments.filter((i) => i.is_active && i.is_confirmed).sort(byMonthlyCostDesc),
    [commitments],
  )
  const detected = useMemo(
    () => commitments.filter((i) => i.is_active && !i.is_confirmed).sort(byMonthlyCostDesc),
    [commitments],
  )
  const inactive = useMemo(() => commitments.filter((i) => !i.is_active), [commitments])

  // A detected bill still leaves the account every month, so the KPIs cover
  // confirmed AND detected commitments. Scoping them to confirmed rows only is
  // what made this page report 0/mo against a ledger full of real rent.
  const summary = useMemo(() => {
    const live = [...active, ...detected]
    const monthlyFor = (type: string) =>
      live
        .filter((s) => s.type === type)
        .reduce((s, i) => s + toMonthlyAmount(i.expected_amount, i.frequency), 0)
    const monthlyExpense = monthlyFor('Expense')
    const monthlyIncome = monthlyFor('Income')
    const deactivatedExpenseSavings = inactive
      .filter((s) => s.type === 'Expense')
      .reduce((s, i) => s + toMonthlyAmount(i.expected_amount, i.frequency), 0)
    return {
      monthlyExpense,
      monthlyIncome,
      netMonthly: monthlyIncome - monthlyExpense,
      count: live.length,
      deactivatedExpenseSavings,
      deactivatedCount: inactive.filter((s) => s.type === 'Expense').length,
    }
  }, [active, detected, inactive])

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
          compact={items.length > 0}
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
            title="Confirmed"
            items={active}
            onUpdate={handleUpdate}
            onDelete={(id, name) => setDeleteTarget({ id, name })}
          />
          <RecurringItemsSection
            title="Detected"
            description="Found in your ledger by pattern detection. Confirm the ones you want to keep, or dismiss the rest."
            items={detected}
            onUpdate={handleUpdate}
            onDelete={(id, name) => setDeleteTarget({ id, name })}
          />
          <RecurringItemsSection
            title="Repeat spending"
            description="These repeat but are not bills, so they stay out of your fixed-cost totals. Mark one as a commitment if it belongs there."
            items={habits}
            muted
            onUpdate={handleUpdate}
            onDelete={(id, name) => setDeleteTarget({ id, name })}
          />
          <RecurringItemsSection
            title="Paused"
            items={inactive}
            muted
            onUpdate={handleUpdate}
            onDelete={(id, name) => setDeleteTarget({ id, name })}
          />
        </>
      )}

      {!isLoading && items.length === 0 && !showForm && (
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

import { useMemo, useState, useCallback } from 'react'
import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { useTotals } from '@/hooks/api/useAnalytics'
import { toast } from 'sonner'
import type { ManualSubscription, SortKey } from './types'
import {
  loadConfirmedIds,
  saveConfirmedIds,
  loadManualSubscriptions,
  saveManualSubscriptions,
  toMonthlyAmount,
  getAnnualFactor,
} from './helpers'

export function useSubscriptionTracker() {
  const { data: recurringTransactions, isLoading } = useRecurringTransactions({
    active_only: false,
    min_confidence: 0,
  })
  const { data: totals } = useTotals()
  const [sortBy, setSortBy] = useState<SortKey>('amount')
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(loadConfirmedIds)
  const [manualSubs, setManualSubs] = useState<ManualSubscription[]>(loadManualSubscriptions)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingManualId, setEditingManualId] = useState<string | null>(null)

  // Filter for expense subscriptions only
  const subscriptions = useMemo(() => {
    if (!recurringTransactions) return []
    return recurringTransactions.filter((t) => t.type === 'Expense')
  }, [recurringTransactions])

  // Toggle confirmed status for a detected subscription
  const handleToggleConfirm = useCallback(
    (id: string) => {
      const updated = new Set(confirmedIds)
      if (updated.has(id)) {
        updated.delete(id)
        toast.success('Subscription unconfirmed')
      } else {
        updated.add(id)
        toast.success('Subscription confirmed as active')
      }
      setConfirmedIds(updated)
      saveConfirmedIds(updated)
    },
    [confirmedIds],
  )

  // Add manual subscription
  const handleAddManual = useCallback(
    (data: Omit<ManualSubscription, 'id'>) => {
      const newSub: ManualSubscription = {
        ...data,
        id: crypto.randomUUID(),
      }
      const updated = [...manualSubs, newSub]
      setManualSubs(updated)
      saveManualSubscriptions(updated)
      setShowCreateForm(false)
      toast.success('Manual subscription added')
    },
    [manualSubs],
  )

  // Edit manual subscription
  const handleEditManual = useCallback(
    (id: string, data: Omit<ManualSubscription, 'id'>) => {
      const updated = manualSubs.map((s) => (s.id === id ? { ...s, ...data } : s))
      setManualSubs(updated)
      saveManualSubscriptions(updated)
      setEditingManualId(null)
      toast.success('Subscription updated')
    },
    [manualSubs],
  )

  // Delete manual subscription
  const handleDeleteManual = useCallback(
    (id: string) => {
      const updated = manualSubs.filter((s) => s.id !== id)
      setManualSubs(updated)
      saveManualSubscriptions(updated)
      toast.success('Subscription removed')
    },
    [manualSubs],
  )

  // Split detected subscriptions into confirmed and unconfirmed
  const confirmedDetected = useMemo(
    () => subscriptions.filter((s) => confirmedIds.has(String(s.id))),
    [subscriptions, confirmedIds],
  )
  const unconfirmedDetected = useMemo(
    () => subscriptions.filter((s) => !confirmedIds.has(String(s.id))),
    [subscriptions, confirmedIds],
  )

  // Sort a list of detected subscriptions
  const sortDetected = useCallback(
    (list: RecurringTransaction[]) => {
      const sorted = [...list]
      switch (sortBy) {
        case 'amount':
          return sorted.sort((a, b) => Math.abs(b.expected_amount) - Math.abs(a.expected_amount))
        case 'name':
          return sorted.sort((a, b) => a.name.localeCompare(b.name))
        case 'last_occurrence':
          return sorted.sort((a, b) => {
            if (!a.last_occurrence) return 1
            if (!b.last_occurrence) return -1
            return new Date(b.last_occurrence).getTime() - new Date(a.last_occurrence).getTime()
          })
        case 'annual_cost':
          return sorted.sort((a, b) => {
            const aCost = Math.abs(a.expected_amount) * getAnnualFactor(a.frequency)
            const bCost = Math.abs(b.expected_amount) * getAnnualFactor(b.frequency)
            return bCost - aCost
          })
        default:
          return sorted
      }
    },
    [sortBy],
  )

  const sortedConfirmed = useMemo(() => sortDetected(confirmedDetected), [confirmedDetected, sortDetected])
  const sortedUnconfirmed = useMemo(() => sortDetected(unconfirmedDetected), [unconfirmedDetected, sortDetected])

  // Sort manual subscriptions
  const sortedManual = useMemo(() => {
    const sorted = [...manualSubs]
    switch (sortBy) {
      case 'amount':
        return sorted.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name))
      case 'last_occurrence':
        return sorted.sort((a, b) => {
          if (!a.next_due) return 1
          if (!b.next_due) return -1
          return new Date(b.next_due).getTime() - new Date(a.next_due).getTime()
        })
      case 'annual_cost':
        return sorted.sort((a, b) => {
          const aCost = Math.abs(a.amount) * getAnnualFactor(a.frequency)
          const bCost = Math.abs(b.amount) * getAnnualFactor(b.frequency)
          return bCost - aCost
        })
      default:
        return sorted
    }
  }, [manualSubs, sortBy])

  // Summary calculations: include confirmed detected + manual subscriptions
  const summary = useMemo(() => {
    const confirmedMonthly = confirmedDetected.reduce(
      (sum, s) => sum + toMonthlyAmount(s.expected_amount, s.frequency),
      0,
    )
    const manualMonthly = manualSubs.reduce(
      (sum, s) => sum + toMonthlyAmount(s.amount, s.frequency),
      0,
    )
    const totalMonthly = confirmedMonthly + manualMonthly
    const activeCount = confirmedDetected.length + manualSubs.length
    const totalAnnual = totalMonthly * 12
    const totalAnnualIncome = totals?.total_income ?? 0
    const incomePercent = totalAnnualIncome > 0 ? (totalAnnual / totalAnnualIncome) * 100 : 0
    return {
      totalMonthly,
      totalAnnual,
      activeCount,
      totalDetected: subscriptions.length,
      average: activeCount > 0 ? totalMonthly / activeCount : 0,
      incomePercent,
    }
  }, [confirmedDetected, manualSubs, subscriptions, totals])

  const hasAnySubs = subscriptions.length > 0 || manualSubs.length > 0

  return {
    isLoading,
    sortBy,
    setSortBy,
    showCreateForm,
    setShowCreateForm,
    editingManualId,
    setEditingManualId,
    confirmedDetected,
    manualSubs,
    sortedConfirmed,
    sortedUnconfirmed,
    sortedManual,
    summary,
    hasAnySubs,
    handleToggleConfirm,
    handleAddManual,
    handleEditManual,
    handleDeleteManual,
  }
}

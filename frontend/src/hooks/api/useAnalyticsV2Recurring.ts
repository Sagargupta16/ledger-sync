/**
 * Recurring-transaction hooks for analytics v2. Re-exported from useAnalyticsV2.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { analyticsV2Keys, type ServiceParams } from '@/hooks/api/analyticsV2Keys'
import { analyticsV2Service, type RecurringTransaction } from '@/services/api/analyticsV2'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'

// Data only changes on upload. Keep cached indefinitely for instant navigations.
const STABLE_STALE_TIME = Infinity

// Recurring Transactions
/** `pattern_kind`: 'commitment' for bill/fixed-cost surfaces, 'habit' for discretionary repeats. */
export function useRecurringTransactions(params?: ServiceParams<'getRecurringTransactions'>) {
  return useQuery<RecurringTransaction[], Error>({
    queryKey: analyticsV2Keys.recurringTransactions(params),
    queryFn: () => analyticsV2Service.getRecurringTransactions(params),
    staleTime: STABLE_STALE_TIME,
  })
}

export interface RecurringTransactionPatch {
  id: number
  pattern_name?: string
  frequency?: string
  expected_amount?: number
  is_confirmed?: boolean
  is_active?: boolean
  pattern_kind?: string
}

export function useUpdateRecurringTransaction() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()
  return useMutation({
    mutationKey: [...analyticsV2Keys.all, 'recurring-transactions', 'update', getSessionGeneration()],
    mutationFn: ({ id, ...body }: RecurringTransactionPatch) => {
      assertCurrentSession(sessionSignal)
      return analyticsV2Service.updateRecurringTransaction(id, body)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      // `void`: every `invalidateQueries` in this file is fire-and-forget, the
      // same convention as useAuth / usePreferences / useAccountStatus. It never
      // rejects (query-core swallows refetch errors unless throwOnError is set),
      // and the mutation's own failure is toasted by the global MutationCache.
      void queryClient.invalidateQueries({ queryKey: analyticsV2Keys.all })
    },
  })
}

export function useCreateRecurringTransaction() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()
  return useMutation({
    mutationKey: [...analyticsV2Keys.all, 'recurring-transactions', 'create', getSessionGeneration()],
    mutationFn: (body: {
      name: string
      type: string
      frequency: string
      amount: number
      category?: string
      expected_day?: number
    }) => {
      assertCurrentSession(sessionSignal)
      return analyticsV2Service.createRecurringTransaction(body)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      void queryClient.invalidateQueries({ queryKey: analyticsV2Keys.all })
    },
  })
}

export function useDeleteRecurringTransaction() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()
  return useMutation({
    mutationKey: [...analyticsV2Keys.all, 'recurring-transactions', 'delete', getSessionGeneration()],
    mutationFn: (id: number) => {
      assertCurrentSession(sessionSignal)
      return analyticsV2Service.deleteRecurringTransaction(id)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      void queryClient.invalidateQueries({ queryKey: analyticsV2Keys.all })
    },
  })
}

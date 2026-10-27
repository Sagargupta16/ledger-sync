/**
 * Category budget writes for the /budgets editor, and the full list they edit.
 *
 * Creation stays `useCreateBudget` in `useAnalyticsV2`, which Settings > Budget
 * defaults shares. Every hook here keys under the same `budgets` prefix, so one
 * invalidation refreshes this list and the active-only list behind the sidebar,
 * mobile tab bar, notification center and Overview badges.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import { analyticsV2Service, type Budget } from '@/services/api/analyticsV2'
import type { UpdateBudgetRequest } from '@/services/api/analyticsV2Planning'

const BUDGETS_KEY = [...analyticsV2Keys.all, 'budgets'] as const
const ALL_BUDGETS_KEY = analyticsV2Keys.budgets({ active_only: false })
const ANOMALIES_KEY = [...analyticsV2Keys.all, 'anomalies'] as const

export type BudgetPatch = UpdateBudgetRequest & { readonly id: number }

/**
 * Refetch both lists, unless the session that started the write has ended.
 * After a saved write the anomaly lists too: a delete, a pause or a limit above
 * this month's spend clears the category's open budget alert on the server.
 */
function refreshBudgets(queryClient: QueryClient, signal: AbortSignal | undefined, saved = false) {
  if (!signal || !isCurrentSession(signal)) return
  void queryClient.invalidateQueries({ queryKey: BUDGETS_KEY })
  if (saved) void queryClient.invalidateQueries({ queryKey: ANOMALIES_KEY })
}

/**
 * Every budget, paused ones included.
 *
 * A hook of its own rather than another `useBudgets(...)` call form: the demo
 * seed contract pins those forms, and nothing reads this list before first
 * paint, so it has no seed. DEMO_ROUTES answers it in demo mode.
 */
export function useAllBudgets() {
  return useQuery<Budget[], Error>({
    queryKey: ALL_BUDGETS_KEY,
    queryFn: () => analyticsV2Service.getBudgets({ active_only: false }),
    staleTime: Infinity,
  })
}

/** Limit, alert threshold, or pause/resume (`is_active`) for one budget. */
export function useUpdateBudget() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...BUDGETS_KEY, 'update', getSessionGeneration()],
    mutationFn: ({ id, ...patch }: BudgetPatch) => {
      assertCurrentSession(sessionSignal)
      return analyticsV2Service.updateBudget(id, patch)
    },
    onMutate: () => sessionSignal,
    onSuccess: (budget, _patch, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      // Show the saved row at once; the refetch re-sorts it and updates the badges.
      queryClient.setQueryData<Budget[]>(ALL_BUDGETS_KEY, (rows) =>
        rows?.map((row) => (row.id === budget.id ? budget : row)))
      refreshBudgets(queryClient, signal, true)
    },
    // The caller shows the message, not a global toast. A 404 means another
    // device deleted the budget, so the refetch drops the stale row.
    onError: (_error, _patch, signal) => refreshBudgets(queryClient, signal),
  })
}

export function useDeleteBudget() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...BUDGETS_KEY, 'delete', getSessionGeneration()],
    mutationFn: (id: number) => {
      assertCurrentSession(sessionSignal)
      return analyticsV2Service.deleteBudget(id)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, id, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      // Drop the row from both lists at once, even if the refetch fails.
      queryClient.setQueriesData<Budget[]>({ queryKey: BUDGETS_KEY }, (rows) =>
        rows?.filter((row) => row.id !== id))
      refreshBudgets(queryClient, signal, true)
    },
    onError: (_error, _id, signal) => refreshBudgets(queryClient, signal),
  })
}

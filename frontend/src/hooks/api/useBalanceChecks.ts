/**
 * Balance checks: the per-account summary and its three writes.
 *
 * The key nests under `analyticsV2Keys.all`, like data-health, so the events
 * that change these verdicts refresh them too: an upload clears the whole
 * cache, and excluded or closed account changes invalidate `analyticsV2`.
 *
 * Writes follow the session-guard pattern: the session is captured at render,
 * asserted before dispatch, and re-checked before the cache is touched. Each
 * write handles its own error (the form shows it), so the global toast stays
 * quiet, and a failed write still refetches: a 404 or 409 usually means the
 * list is stale.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import {
  assertCurrentSession,
  getSessionGeneration,
  getSessionSignal,
  isCurrentSession,
} from '@/lib/session'
import { balanceChecksService, type BalanceCheckInput } from '@/services/api/balanceChecks'

/** The endpoint takes no params, so the key takes none (staleTime is Infinity). */
export const balanceCheckKeys = {
  all: [...analyticsV2Keys.all, 'balance-checks'] as const,
}

/**
 * Refetch the summary unless the session that started the write has ended.
 * Returned so the mutation settles only once the new verdict is cached: the
 * form leaves its saving state with the dot already showing the result.
 * `invalidateQueries` never rejects (query-core swallows refetch errors).
 */
function refreshChecks(
  queryClient: QueryClient,
  signal: AbortSignal | undefined,
): Promise<void> | undefined {
  if (!signal || !isCurrentSession(signal)) return undefined
  return queryClient.invalidateQueries({ queryKey: balanceCheckKeys.all })
}

export function useBalanceChecks() {
  return useQuery({
    queryKey: balanceCheckKeys.all,
    queryFn: () => balanceChecksService.getSummary(),
    staleTime: Infinity,
  })
}

export function useRecordBalanceCheck() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...balanceCheckKeys.all, 'record', getSessionGeneration()],
    mutationFn: ({ account, input }: { account: string; input: BalanceCheckInput }) => {
      assertCurrentSession(sessionSignal)
      return balanceChecksService.recordCheck(account, input)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => refreshChecks(queryClient, signal),
    onError: (_error, _variables, signal) => refreshChecks(queryClient, signal),
  })
}

export function useUpdateBalanceCheck() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...balanceCheckKeys.all, 'update', getSessionGeneration()],
    mutationFn: ({ id, input }: { id: number; input: BalanceCheckInput }) => {
      assertCurrentSession(sessionSignal)
      return balanceChecksService.updateCheck(id, input)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => refreshChecks(queryClient, signal),
    onError: (_error, _variables, signal) => refreshChecks(queryClient, signal),
  })
}

export function useDeleteBalanceCheck() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...balanceCheckKeys.all, 'delete', getSessionGeneration()],
    mutationFn: (id: number) => {
      assertCurrentSession(sessionSignal)
      return balanceChecksService.deleteCheck(id)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => refreshChecks(queryClient, signal),
    onError: (_error, _variables, signal) => refreshChecks(queryClient, signal),
  })
}

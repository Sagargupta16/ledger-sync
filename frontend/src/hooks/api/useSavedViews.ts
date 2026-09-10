import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { savedViewsService } from '@/services/api/savedViews'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'

/**
 * Fetch the user's saved filter views (ordered by name server-side).
 */
export function useSavedViews() {
  return useQuery({
    queryKey: ['saved-views'],
    queryFn: () => savedViewsService.getViews(),
    staleTime: Infinity,
  })
}

/**
 * Save (upsert-by-name) the current filter set as a named view.
 */
export function useSaveView() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: ['saved-views', 'save', getSessionGeneration()],
    mutationFn: ({ name, filters }: { name: string; filters: Record<string, unknown> }) => {
      assertCurrentSession(sessionSignal)
      return savedViewsService.saveView(name, filters)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      // Fire-and-forget: invalidateQueries never rejects (query-core swallows
      // refetch errors), and a failed save toasts via the global MutationCache.
      void queryClient.invalidateQueries({ queryKey: ['saved-views'] })
    },
  })
}

/**
 * Delete a saved view by id.
 */
export function useDeleteView() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: ['saved-views', 'delete', getSessionGeneration()],
    mutationFn: (id: number) => {
      assertCurrentSession(sessionSignal)
      return savedViewsService.deleteView(id)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      // Fire-and-forget: see useSaveView above.
      void queryClient.invalidateQueries({ queryKey: ['saved-views'] })
    },
  })
}

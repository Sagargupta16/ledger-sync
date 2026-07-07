import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { savedViewsService } from '@/services/api/savedViews'

/**
 * Fetch the user's saved filter views (ordered by name server-side).
 */
export function useSavedViews() {
  return useQuery({
    queryKey: ['saved-views'],
    queryFn: savedViewsService.getViews,
    staleTime: Infinity,
  })
}

/**
 * Save (upsert-by-name) the current filter set as a named view.
 */
export function useSaveView() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, filters }: { name: string; filters: Record<string, unknown> }) =>
      savedViewsService.saveView(name, filters),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-views'] })
    },
  })
}

/**
 * Delete a saved view by id.
 */
export function useDeleteView() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: savedViewsService.deleteView,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-views'] })
    },
  })
}

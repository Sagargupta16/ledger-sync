import { MutationCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/**
 * Default error message for a mutation that doesn't surface its own. Many
 * mutations (AI mode toggle, goal/budget/recurring CRUD) only defined onSuccess,
 * so a failed save/delete reverted silently and the user thought it worked.
 */
function mutationErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const resp = (error as { response?: { data?: { detail?: unknown } } }).response
    if (typeof resp?.data?.detail === 'string') return resp.data.detail
    const msg = (error as { message?: unknown }).message
    if (typeof msg === 'string' && msg) return msg
  }
  return 'Something went wrong. Please try again.'
}

export const queryClient = new QueryClient({
  // Global fallback so a mutation failure is never silent. A mutation can still
  // pass its own onError (e.g. to set inline form state); this only fires when
  // the mutation's own onError throws or is absent, per TanStack Query v5.
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.options.onError) return // mutation handles its own errors
      toast.error(mutationErrorMessage(error))
    },
  }),
  defaultOptions: {
    queries: {
      // Data only changes on explicit user actions (upload, settings save).
      // Mutations invalidate relevant keys, so keep cache fresh indefinitely.
      staleTime: Infinity,
      gcTime: 1000 * 60 * 60, // 1 hour — keep unused data in memory longer
      retry: 1,
      refetchOnWindowFocus: false,
      // refetchOnMount defaults to true: refetch stale queries on component mount.
      // With staleTime: Infinity, queries are only stale after explicit invalidation
      // (e.g. after upload), so page navigations stay instant until data changes.
    },
  },
})

import { MutationCache, QueryClient } from '@tanstack/react-query'
import { isCancel } from 'axios'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/errorUtils'

/**
 * Default error message for a mutation that doesn't surface its own. Many
 * mutations (AI mode toggle, goal/budget/recurring CRUD) only defined onSuccess,
 * so a failed save/delete reverted silently and the user thought it worked.
 */
function mutationErrorMessage(error: unknown): string {
  return getApiErrorMessage(error, 'Something went wrong. Please try again.')
}

/** Errors a call site or an inline surface (ConfirmDialog) already reported. */
const reportedErrors = new WeakSet<object>()

/**
 * Report a mutation failure in exactly one place: a caller that shows the
 * error itself (a per-call `onError` toast, an inline message, a dialog) marks
 * it, and the global fallback toast below then stays quiet. TanStack only
 * exposes the hook-level `onError` to the cache, so a per-call one cannot be
 * detected any other way.
 */
export function markErrorReported(error: unknown): void {
  if (typeof error === 'object' && error !== null) reportedErrors.add(error)
}

export const queryClient = new QueryClient({
  // Global fallback so a mutation failure is never silent. A mutation can still
  // pass its own onError (e.g. to set inline form state); this only fires when
  // the mutation's own onError throws or is absent, per TanStack Query v5.
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.options.onError) return // mutation handles its own errors
      // A sign-out or account switch cancels queued work; that is not a failure.
      if (isCancel(error)) return
      // Per-call callbacks and the awaiting caller run after this hook within
      // the same task, so wait one task before deciding nobody reported it.
      setTimeout(() => {
        if (typeof error === 'object' && error !== null && reportedErrors.has(error)) return
        toast.error(mutationErrorMessage(error))
      }, 0)
    },
  }),
  defaultOptions: {
    queries: {
      // Data only changes on explicit user actions (upload, settings save).
      // Mutations invalidate relevant keys, so keep cache fresh indefinitely.
      staleTime: Infinity,
      gcTime: 1000 * 60 * 60, // 1 hour -- keep unused data in memory longer
      retry: 1,
      // Fetch even when the browser reports offline. In the default 'online'
      // mode a first fetch pauses, so it is neither loading nor an error and
      // pages fell through to their empty states. Offline now fails like any
      // network error and pages show their error state. 'always' turns
      // reconnect refetching off by default, so it is switched back on.
      networkMode: 'always',
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      // refetchOnMount defaults to true: refetch stale queries on component mount.
      // With staleTime: Infinity, queries are only stale after explicit invalidation
      // (e.g. after upload), so page navigations stay instant until data changes.
    },
    mutations: {
      // Same reason as queries: in 'online' mode a save made offline pauses,
      // so its button spins as pending forever with no error. Offline now
      // fails like any network error and reaches the toast above.
      networkMode: 'always',
    },
  },
})

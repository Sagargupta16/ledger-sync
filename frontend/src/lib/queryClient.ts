import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
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

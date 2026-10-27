/**
 * Dashboard watch tiles: saved views pinned to the Dashboard, each with its
 * month-to-date total, the same days of last month and a six-month trend.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import { watchTilesService, type WatchPin, type WatchTilesResponse } from '@/services/api/watchTiles'

/**
 * In the `calculations` family on purpose: a tile sums ledger rows, so every
 * write that `invalidatePreferenceDependents` covers (excluded accounts,
 * categorization rules, review decisions, account status) refreshes it with the
 * Dashboard's other figures, and an upload refreshes the whole cache. Saving or
 * deleting a view refreshes it through `refreshWatchTiles`.
 */
export const WATCH_TILES_KEY = ['calculations', 'watch-tiles'] as const
const SAVED_VIEWS_KEY = ['saved-views'] as const

/** Refetch, unless the session that started the write has ended. */
function refresh(
  queryClient: QueryClient,
  signal: AbortSignal | undefined,
  queryKey: readonly string[] = WATCH_TILES_KEY,
) {
  if (!signal || !isCurrentSession(signal)) return
  // Fire-and-forget: invalidateQueries never rejects (query-core swallows refetch errors).
  void queryClient.invalidateQueries({ queryKey })
}

/** After a saved-view write: what a pinned view lists, or whether it exists, may have changed. */
export function refreshWatchTiles(queryClient: QueryClient, signal: AbortSignal | undefined) {
  refresh(queryClient, signal)
}

/** The tiles in the response, in `viewIds` order first, then the rest as they were. */
function withOrder(data: WatchTilesResponse, viewIds: readonly number[]): WatchTilesResponse {
  const rank = new Map(viewIds.map((id, index) => [id, index]))
  const tiles = [...data.tiles].sort(
    (a, b) => (rank.get(a.view_id) ?? viewIds.length + a.position) - (rank.get(b.view_id) ?? viewIds.length + b.position),
  )
  return { ...data, tiles: tiles.map((tile, position) => ({ ...tile, position })) }
}

/** `enabled: false` lets a menu wait until it opens before asking for the tiles. */
export function useWatchTiles({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: WATCH_TILES_KEY,
    queryFn: ({ signal }) => watchTilesService.getTiles(signal),
    staleTime: Infinity,
    enabled,
  })
}

// Failures toast through the global MutationCache (no hook-level onError), which
// shows the server's own reason, such as the pin limit. `onSettled` refetches
// either way, so a 404 or 409 from a stale list also corrects the screen.

export function usePinView() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...WATCH_TILES_KEY, 'pin', getSessionGeneration()],
    mutationFn: (viewId: number) => {
      assertCurrentSession(sessionSignal)
      return watchTilesService.pinView(viewId)
    },
    onMutate: () => sessionSignal,
    onSettled: (_pin, _error, _viewId, signal) => refresh(queryClient, signal),
  })
}

export function useUnpinView() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...WATCH_TILES_KEY, 'unpin', getSessionGeneration()],
    mutationFn: (viewId: number) => {
      assertCurrentSession(sessionSignal)
      return watchTilesService.unpinView(viewId)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, viewId, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      // Drop the tile at once; the refetch below brings suggestions if it was the last.
      queryClient.setQueryData<WatchTilesResponse>(WATCH_TILES_KEY, (data) =>
        data && { ...data, tiles: data.tiles.filter((tile) => tile.view_id !== viewId) })
    },
    onSettled: (_data, _error, _viewId, signal) => refresh(queryClient, signal),
  })
}

/** Moves the tiles at once; the server's order replaces it, or a refetch on failure. */
export function useReorderWatchTiles() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...WATCH_TILES_KEY, 'reorder', getSessionGeneration()],
    mutationFn: (viewIds: number[]) => {
      assertCurrentSession(sessionSignal)
      return watchTilesService.reorderPins(viewIds)
    },
    onMutate: (viewIds) => {
      if (isCurrentSession(sessionSignal)) {
        queryClient.setQueryData<WatchTilesResponse>(WATCH_TILES_KEY, (data) => data && withOrder(data, viewIds))
      }
      return sessionSignal
    },
    onSuccess: (pins: WatchPin[], _viewIds, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      const order = pins.map((pin) => pin.view_id)
      queryClient.setQueryData<WatchTilesResponse>(WATCH_TILES_KEY, (data) => data && withOrder(data, order))
    },
    onSettled: (_pins, error, _viewIds, signal) => {
      if (error) refresh(queryClient, signal)
    },
  })
}

/** One-tap pin of a suggested category: creates (or reuses) its saved view too. */
export function usePinCategory() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...WATCH_TILES_KEY, 'pin-category', getSessionGeneration()],
    mutationFn: (category: string) => {
      assertCurrentSession(sessionSignal)
      return watchTilesService.pinCategory(category)
    },
    onMutate: () => sessionSignal,
    onSettled: (_pin, _error, _category, signal) => {
      refresh(queryClient, signal)
      // A new saved view may exist now, so the views list refreshes too.
      refresh(queryClient, signal, SAVED_VIEWS_KEY)
    },
  })
}

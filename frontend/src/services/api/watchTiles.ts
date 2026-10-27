import { apiClient } from './client'

/** What a tile sums: the type its view filters to, or its expense rows when it has none. */
export type WatchMeasure = 'expense' | 'income' | 'transfer'

export interface WatchTrendPoint {
  /** `YYYY-MM`, one of the six complete months before this one. */
  month: string
  amount: number
}

/** One pinned saved view, measured on the IST ledger calendar. */
export interface WatchTile {
  view_id: number
  name: string
  position: number
  measure: WatchMeasure
  /** False when the stored filters fail validation; the sums are then 0. */
  filters_valid: boolean
  /** The view has its own date bounds, which narrow every window. */
  has_date_range: boolean
  /**
   * The view has no type filter and also lists income or transfer rows in
   * these months; the tile counts its expense rows only.
   */
  other_types_present: boolean
  month_to_date: number
  /** Day 1 through the same day of last month, clamped to its length. */
  previous_same_period: number
  /** Percent change against `previous_same_period`; null when that is 0. */
  change_pct: number | null
  transaction_count: number
  /** Oldest first. */
  trend: WatchTrendPoint[]
}

/** A category offered as a one-tap pin while nothing is pinned. */
export interface WatchSuggestion {
  category: string
  amount: number
  transaction_count: number
}

export interface WatchPeriod {
  today: string
  month_start: string
  previous_start: string
  previous_end: string
  trend_months: string[]
}

export interface WatchTilesResponse {
  period: WatchPeriod
  tiles: WatchTile[]
  suggestions: WatchSuggestion[]
  /** `YYYY-MM` the suggestions rank, null when there is no spending to rank. */
  suggestions_month: string | null
  max_pins: number
}

export interface WatchPin {
  view_id: number
  position: number
}

export interface WatchCategoryPin extends WatchPin {
  name: string
}

/**
 * Narrow an unknown payload to `WatchTilesResponse`, throwing when it is not one.
 *
 * Demo mode answers by URL substring, first match wins, and the saved-views
 * list route also matches this URL: a misordered route would hand back a bare
 * array. Throwing turns that into the tiles' error state instead of a crash.
 */
function assertWatchTiles(payload: unknown): WatchTilesResponse {
  const body = payload as Partial<WatchTilesResponse> | null
  if (!body || !Array.isArray(body.tiles) || !Array.isArray(body.suggestions) || !body.period) {
    throw new TypeError('saved-views/tiles returned an unexpected payload')
  }
  return body as WatchTilesResponse
}

export const watchTilesService = {
  getTiles: async (signal?: AbortSignal): Promise<WatchTilesResponse> => {
    const response = await apiClient.get<unknown>('/api/saved-views/tiles', signal ? { signal } : {})
    return assertWatchTiles(response.data)
  },

  /** Idempotent: an already pinned view keeps its place. */
  pinView: async (viewId: number): Promise<WatchPin> => {
    const response = await apiClient.put<WatchPin>(`/api/saved-views/${viewId}/pin`)
    return response.data
  },

  /** Idempotent; the saved view itself stays. */
  unpinView: async (viewId: number): Promise<void> => {
    await apiClient.delete(`/api/saved-views/${viewId}/pin`)
  },

  /** Pins left out of `viewIds` follow in their current order. */
  reorderPins: async (viewIds: number[]): Promise<WatchPin[]> => {
    const response = await apiClient.put<WatchPin[]>('/api/saved-views/pins/order', {
      view_ids: viewIds,
    })
    return response.data
  },

  /** Reuses a saved view that shows exactly this category's spending, else creates one. */
  pinCategory: async (category: string): Promise<WatchCategoryPin> => {
    const response = await apiClient.post<WatchCategoryPin>('/api/saved-views/pins/category', {
      category,
    })
    return response.data
  },
}

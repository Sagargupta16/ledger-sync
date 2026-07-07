import { apiClient } from './client'

/**
 * The backend treats `filters` as a fully opaque JSON object (the frontend
 * FilterValues shape echoed verbatim). Kept as Record<string, unknown> here
 * to avoid a service -> component type dependency.
 */
export interface SavedView {
  id: number
  name: string
  filters: Record<string, unknown>
  created_at: string
  updated_at: string
}

export const savedViewsService = {
  getViews: async (): Promise<SavedView[]> => {
    const response = await apiClient.get<SavedView[]>('/api/saved-views')
    return response.data
  },

  /** Upserts by name: an existing view with the same name is overwritten. */
  saveView: async (name: string, filters: Record<string, unknown>): Promise<SavedView> => {
    const response = await apiClient.post<SavedView>('/api/saved-views', { name, filters })
    return response.data
  },

  deleteView: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/saved-views/${id}`)
  },
}

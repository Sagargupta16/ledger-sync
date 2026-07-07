import { apiClient } from './client'

export interface CategorizationRule {
  id: number
  match_field: 'note' | 'account'
  pattern: string
  category: string
  subcategory: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface CategorizationRuleInput {
  match_field: 'note' | 'account'
  pattern: string
  category: string
  subcategory?: string | null
  is_active: boolean
  sort_order: number
}

export const categorizationRulesService = {
  getRules: async (): Promise<CategorizationRule[]> => {
    const response = await apiClient.get<CategorizationRule[]>('/api/categorization-rules')
    return response.data
  },

  createRule: async (rule: CategorizationRuleInput): Promise<CategorizationRule> => {
    const response = await apiClient.post<CategorizationRule>('/api/categorization-rules', rule)
    return response.data
  },

  updateRule: async (id: number, rule: CategorizationRuleInput): Promise<CategorizationRule> => {
    const response = await apiClient.put<CategorizationRule>(`/api/categorization-rules/${id}`, rule)
    return response.data
  },

  deleteRule: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/categorization-rules/${id}`)
  },

  /**
   * Retroactively apply all active rules to existing live, non-transfer
   * transactions. Rewritten rows get NEW transaction ids (category feeds the
   * dedup hash), so callers must invalidate transaction + analytics queries.
   */
  applyRules: async (): Promise<{ matched: number; updated: number; analytics_refreshed: boolean }> => {
    const response = await apiClient.post<{ matched: number; updated: number; analytics_refreshed: boolean }>(
      '/api/categorization-rules/apply',
    )
    return response.data
  },
}

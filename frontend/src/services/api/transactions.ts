import type { Transaction } from '@/types'

import { apiClient } from './client'

export interface TransactionFilters {
  query?: string
  category?: string
  subcategory?: string
  account?: string
  type?: string
  tag?: string
  min_amount?: number
  max_amount?: number
  start_date?: string
  end_date?: string
  limit?: number
  offset?: number
  sort?: string
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  limit: number
  offset: number
  has_more: boolean
}

export interface TagFacet {
  name: string
  count: number
}

export interface TransactionFacets {
  categories: string[]
  accounts: string[]
  tags: TagFacet[]
  income_count: number
  expense_count: number
  transfer_count: number
  total_count: number
}

export const transactionsService = {
  /**
   * Get ALL transactions (for charts and analytics that need complete data).
   * Uses the dedicated /all endpoint — single request, no pagination loop.
   */
  getTransactions: async (filters?: TransactionFilters): Promise<Transaction[]> => {
    // If a specific limit is provided, use the search endpoint (supports all filters)
    if (filters?.limit) {
      const { sort, ...rest } = filters
      const response = await apiClient.get<PaginatedResponse<Transaction> | Transaction[]>(
        '/api/transactions/search',
        {
          params: { ...rest, sort_by: sort },
        },
      )
      if (Array.isArray(response.data)) {
        return response.data
      }
      return response.data?.data || []
    }

    // Fetch ALL transactions in a single request via dedicated endpoint
    const response = await apiClient.get<Transaction[]>('/api/transactions/all', {
      params: {
        start_date: filters?.start_date,
        end_date: filters?.end_date,
      },
    })
    return response.data || []
  },

  /**
   * Get dropdown facets + per-type counts for the Transactions page.
   * Computed server-side (DISTINCT / GROUP BY) so the browser never pulls
   * the full ledger just to populate filters and a summary card.
   */
  getFacets: async (): Promise<TransactionFacets> => {
    const response = await apiClient.get<TransactionFacets>('/api/transactions/facets')
    return response.data
  },

  getTransactionsPaginated: async (filters?: TransactionFilters): Promise<PaginatedResponse<Transaction>> => {
    const { sort, ...rest } = filters || {}
    const response = await apiClient.get<PaginatedResponse<Transaction>>('/api/transactions/search', {
      params: { ...rest, sort_by: sort, limit: rest.limit || 100 },
    })
    return response.data
  },

  /**
   * Replace the full tag list on a transaction. Empty array clears all tags.
   */
  updateTransactionTags: async (
    transactionId: string,
    tags: string[],
  ): Promise<{ transaction_id: string; tags: string[] }> => {
    const response = await apiClient.put<{ transaction_id: string; tags: string[] }>(
      `/api/transactions/${transactionId}/tags`,
      { tags },
    )
    return response.data
  },

  exportToCSV: async (filters: TransactionFilters = {}): Promise<Blob> => {
    const response = await apiClient.get('/api/transactions/export', {
      params: filters,
      responseType: 'blob',
    })
    return response.data
  },
}

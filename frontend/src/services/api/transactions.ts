import { apiClient } from './client'
import type { Transaction } from '@/types'

export interface TransactionFilters {
  query?: string
  category?: string
  subcategory?: string
  account?: string
  type?: string
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

export const transactionsService = {
  /**
   * Get ALL transactions (for charts and analytics that need complete data).
   * This fetches all pages from the API.
   */
  getTransactions: async (filters?: TransactionFilters): Promise<Transaction[]> => {
    // If a specific limit is provided, use single request
    if (filters?.limit) {
      const response = await apiClient.get<PaginatedResponse<Transaction> | Transaction[]>('/api/transactions', {
        params: filters,
      })
      if (Array.isArray(response.data)) {
        return response.data
      }
      return response.data?.data || []
    }
    
    // Otherwise fetch ALL transactions (for charts/analytics)
    const allTransactions: Transaction[] = []
    let offset = 0
    const pageSize = 1000 // Fetch in larger chunks for efficiency
    const maxPages = 50 // Safety cap: max 50,000 transactions to prevent OOM
    let page = 0
    
    while (page < maxPages) {
      const response = await apiClient.get<PaginatedResponse<Transaction>>('/api/transactions', {
        params: { ...filters, limit: pageSize, offset },
      })
      
      const pageData = response.data?.data || []
      allTransactions.push(...pageData)
      
      if (!response.data?.has_more || pageData.length === 0) {
        break
      }
      offset += pageSize
      page++
    }
    
    return allTransactions
  },

  getTransactionsPaginated: async (filters?: TransactionFilters): Promise<PaginatedResponse<Transaction>> => {
    const response = await apiClient.get<PaginatedResponse<Transaction>>('/api/transactions', {
      params: { ...filters, limit: filters?.limit || 100 },
    })
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

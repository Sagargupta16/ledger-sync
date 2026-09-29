/**
 * Analytics V2 -- recurring transactions (detected patterns + manual CRUD).
 */

import { apiClient } from './client'
import { getWrapped } from './analyticsV2Request'

export interface RecurringTransaction {
  id: number
  name: string
  category: string
  subcategory: string | null
  account: string
  type: string | null
  frequency: string | null
  expected_amount: number
  variance: number
  expected_day: number | null
  confidence: number
  occurrences: number
  last_occurrence: string | null
  next_expected: string | null
  times_missed: number
  is_active: boolean
  is_confirmed: boolean
  /**
   * 'commitment' = owed on a calendar date (rent, salary, Netflix).
   * 'habit' = repeats but is discretionary (the daily lunch, the weekly fruit run).
   *
   * Gap regularity cannot tell the two apart, so any surface that means "fixed
   * cost", "bill" or "missed payment" must filter to 'commitment'.
   */
  pattern_kind: string
}

export const recurringApi = {
  // Recurring Transactions
  //
  // The handler declares active_only / min_confidence / pattern_kind. `limit`
  // and `offset` were dropped.
  getRecurringTransactions(params?: {
    active_only?: boolean
    min_confidence?: number
    pattern_kind?: string
  }) {
    return getWrapped<RecurringTransaction>('/api/analytics/v2/recurring-transactions', params)
  },

  async updateRecurringTransaction(
    id: number,
    body: {
      pattern_name?: string
      frequency?: string
      expected_amount?: number
      is_confirmed?: boolean
      is_active?: boolean
      pattern_kind?: string
    },
  ) {
    const response = await apiClient.patch<{ status: string; id: number }>(
      `/api/analytics/v2/recurring-transactions/${id}`,
      body,
    )
    return response.data
  },

  async createRecurringTransaction(body: {
    name: string
    type: string
    frequency: string
    amount: number
    category?: string
    expected_day?: number
  }) {
    const response = await apiClient.post<{ status: string; id: number }>(
      '/api/analytics/v2/recurring-transactions',
      body,
    )
    return response.data
  },

  async deleteRecurringTransaction(id: number) {
    const response = await apiClient.delete<{ status: string; id: number }>(
      `/api/analytics/v2/recurring-transactions/${id}`,
    )
    return response.data
  },
}

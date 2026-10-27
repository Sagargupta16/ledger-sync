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
  /** The effective amount per cycle: the user's amount when one is set, else the detected one. */
  expected_amount: number
  /**
   * What detection last derived from history; refresh keeps updating it beside
   * a user's amount. Null on a row added by hand. Optional because older
   * backends and cached responses do not carry it.
   */
  detected_amount?: number | null
  /**
   * The user set `expected_amount` and it differs from `detected_amount`, so a
   * reset would change it. Refresh never overwrites the user's amount.
   */
  amount_edited?: boolean
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

/** A PATCH answers with the row's amount state, in the same shape as the list. */
export interface RecurringPatchResult {
  status: string
  id: number
  expected_amount: number
  detected_amount: number | null
  amount_edited: boolean
}

async function patchRecurring(id: number, body: object) {
  const response = await apiClient.patch<RecurringPatchResult>(
    `/api/analytics/v2/recurring-transactions/${id}`,
    body,
  )
  return response.data
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

  updateRecurringTransaction(
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
    return patchRecurring(id, body)
  },

  /**
   * Set the amount the user expects per cycle, or pass `null` to go back to the
   * detected amount. On a detected row the amount is kept beside the detected
   * one, so the next analytics refresh does not overwrite it.
   */
  setRecurringAmount(id: number, amount: number | null) {
    return patchRecurring(id, amount === null ? { reset_amount: true } : { expected_amount: amount })
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

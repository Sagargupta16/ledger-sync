/**
 * Owner stats (`GET /api/admin/stats`): app-wide totals for the accounts listed
 * in LEDGER_SYNC_ADMIN_EMAILS. Counts and sums only, never an email, a name or
 * any account's rows. Everyone else gets 403.
 */

import { apiClient } from './client'

export type FundingSource = 'app' | 'personal' | 'legacy'

export interface AdminAiTotals {
  calls: number
  tokens: number
  /** Estimate at Bedrock and provider list prices, in US dollars. */
  cost_usd: number
}

export interface AdminStats {
  /** UTC timestamp the totals were read. */
  as_of: string
  users: {
    total: number
    signed_in_7d: number
    signed_in_30d: number
    new_30d: number
  }
  ledger: {
    /** Live (not soft-deleted) transactions across every account. */
    transactions: number
    imports_30d: number
    rows_imported_30d: number
  }
  ai: {
    today: AdminAiTotals
    last_30d: AdminAiTotals
    by_funding_30d: Array<{ funding_source: FundingSource; calls: number; cost_usd: number }>
    /** 30 UTC days, oldest first, zero-filled. */
    daily: Array<{ date: string; calls: number; cost_usd: number }>
  }
}

export const adminService = {
  async getStats(): Promise<AdminStats> {
    const response = await apiClient.get<AdminStats>('/api/admin/stats')
    return response.data
  },
}

/**
 * Owner stats (`GET /api/admin/stats`) for the accounts listed in
 * LEDGER_SYNC_ADMIN_EMAILS: app-wide counts and sums, a list of accounts with
 * masked emails and activity counts, and the app's health. Never a full email,
 * a name, an amount or any account's transactions. Everyone else gets 403.
 */

import { apiClient } from './client'

export type FundingSource = 'app' | 'personal' | 'legacy'

export interface AdminAiTotals {
  calls: number
  tokens: number
  /** Estimate at Bedrock and provider list prices, in US dollars. */
  cost_usd: number
}

export interface AdminAccount {
  id: number
  /** Masked: first three characters of the local part and the domain, e.g. `sg8***@gmail.com`. */
  email: string
  /** `google`, `github`, or `other` for accounts from before provider sign-in was recorded. */
  provider: string
  created_at: string | null
  last_login: string | null
  /** The latest of sign-in, import and AI call. */
  last_active: string | null
  transactions: number
  imports: number
  ai_calls_30d: number
}

export interface AdminStats {
  /** UTC timestamp the totals were read. */
  as_of: string
  users: {
    total: number
    signed_in_7d: number
    signed_in_30d: number
    new_30d: number
    /** Accounts that imported a file, made an AI call or signed in within the window. */
    active_7d: number
    active_30d: number
    by_provider: { google: number; github: number; other: number }
    /** 12 months, oldest first, zero-filled. */
    signups_by_month: Array<{ month: string; signups: number }>
    /** Most recently active first, at most `list_limit`. */
    list: AdminAccount[]
    list_limit: number
  }
  ledger: {
    /** Live (not soft-deleted) transactions across every account. */
    transactions: number
    by_type: { Income: number; Expense: number; Transfer: number }
    imports_30d: number
    rows_imported_30d: number
    /** 30 UTC days, oldest first, zero-filled. */
    imports_daily: Array<{ date: string; imports: number }>
  }
  ai: {
    today: AdminAiTotals
    last_30d: AdminAiTotals
    by_funding_30d: Array<{ funding_source: FundingSource; calls: number; cost_usd: number }>
    by_model_30d: Array<{ model: string; calls: number; tokens: number; cost_usd: number }>
    /** 30 UTC days, oldest first, zero-filled. */
    daily: Array<{ date: string; calls: number; cost_usd: number }>
  }
  app: {
    version: string
    /** `postgresql` in production, `sqlite` locally. */
    database: string
    /** Alembic head(s) applied, or null when the table is missing. */
    revision: string | null
    /** Accounts using each feature; null when its table does not exist yet. */
    features: {
      cas_holdings: number | null
      push_subscriptions: number | null
      active_upload_tokens: number | null
      bank_alerts: number | null
      saved_views: number | null
      byok_ai: number | null
    }
    tables: Array<{ table: string; rows: number }>
  }
}

export const adminService = {
  async getStats(): Promise<AdminStats> {
    const response = await apiClient.get<AdminStats>('/api/admin/stats')
    return response.data
  },
}

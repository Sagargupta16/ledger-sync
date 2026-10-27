/**
 * Balance checks: what the bank or card said an account held at the end of a
 * day, against the ledger's running balance for that account and day.
 *
 * The server recomputes every verdict on read (`core/balance_checks.py`), so a
 * re-import that changes old rows moves the dot without anyone re-saving.
 */

import { apiClient } from './client'

/**
 * One dot per account, in this precedence (`account_status` in the backend):
 * a mismatch wins, then 30 idle days, then no check yet, then rows dated after
 * the newest check, otherwise matched.
 */
export type BalanceStatus = 'matched' | 'mismatch' | 'changed' | 'unchecked' | 'idle'

export interface BalanceCheckResult {
  id: number
  /** `YYYY-MM-DD` IST day; compared with the ledger at the END of that day. */
  check_date: string
  /** What the bank showed, signed: card dues and overdrafts are negative. */
  balance: number
  /** The ledger's running balance at the end of `check_date`. */
  ledger_balance: number
  /** Bank minus ledger. Positive means the ledger holds less than the bank. */
  difference: number
  matches: boolean
}

export interface AccountMonth {
  /** `YYYY-MM` */
  month: string
  rows: number
}

export interface AccountBalanceHealth {
  /** The label exactly as the transactions carry it. */
  account: string
  is_closed: boolean
  status: BalanceStatus
  /** The running balance at the end of `as_of`; rows dated later are left out. */
  ledger_balance: number
  /** Every live row, including any dated after `as_of`; so are the dates and months. */
  transaction_count: number
  first_date: string | null
  last_date: string | null
  /** The later of the newest row on or before `as_of` and the newest check; idle counts from it. */
  last_activity: string | null
  /** Rows dated after the newest check, up to `as_of`; 0 when there is none. */
  rows_after_check: number
  /** Newest first. */
  checks: BalanceCheckResult[]
  /** Months with rows only, oldest first. A month missing in between is a gap. */
  months: AccountMonth[]
}

export interface BalanceChecksSummary {
  /** The IST day the statuses were computed for. */
  as_of: string
  idle_days: number
  /** Largest difference, in INR, that still counts as a match. */
  tolerance: number
  /** Every non-excluded account with rows, plus any account with a check, by name. */
  accounts: AccountBalanceHealth[]
}

export interface BalanceCheckInput {
  /** `YYYY-MM-DD`, from 2000-01-01 to today (IST). */
  check_date: string
  /** Exact decimal string, e.g. `-12500.50`, so no float rounding reaches the server. */
  balance: string
}

export interface BalanceCheckEntry {
  id: number
  account: string
  check_date: string
  balance: number
}

/**
 * Throw on anything that is not a summary. A demo-mode catch-all answers `[]`
 * for an unknown route, and a panel reading `.accounts` off that would crash
 * the page instead of showing its own error.
 */
function assertSummary(payload: unknown): BalanceChecksSummary {
  const accounts = (payload as { accounts?: unknown } | null)?.accounts
  if (typeof payload !== 'object' || payload === null || !Array.isArray(accounts)) {
    throw new TypeError('balance-checks returned an unexpected payload')
  }
  return payload as BalanceChecksSummary
}

export const balanceChecksService = {
  getSummary: async (): Promise<BalanceChecksSummary> => {
    const response = await apiClient.get<unknown>('/api/balance-checks')
    return assertSummary(response.data)
  },

  /** A second check on the same account and day replaces the first. */
  recordCheck: async (account: string, input: BalanceCheckInput): Promise<BalanceCheckEntry> => {
    const response = await apiClient.post<BalanceCheckEntry>('/api/balance-checks', {
      account,
      ...input,
    })
    return response.data
  },

  updateCheck: async (id: number, input: BalanceCheckInput): Promise<BalanceCheckEntry> => {
    const response = await apiClient.put<BalanceCheckEntry>(`/api/balance-checks/${id}`, input)
    return response.data
  },

  deleteCheck: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/balance-checks/${id}`)
  },
}

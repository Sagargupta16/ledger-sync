import { API_BASE_URL } from '@/constants'

import { apiClient } from './client'

/**
 * Bank alerts: debit and credit SMS or emails that an automation (an iPhone
 * Shortcut) posts to `POST /api/ingest/text` with an `alerts:ingest` token.
 * The server keeps the parsed fields, never the text, and matches each alert
 * against the current ledger on every read (`backend/core/bank_alert_matching.py`).
 */
export type BankAlertStatus = 'matched' | 'missing' | 'ignored'

export interface BankAlert {
  id: number
  direction: 'debit' | 'credit'
  amount: number
  /** Last digits (at most four) of the account or card the alert names. */
  account_tail: string | null
  /** Payee label read from the text; long digit runs arrive masked. */
  merchant: string | null
  /** Bank display name, e.g. "HDFC Bank", when the text or sender named it. */
  bank: string | null
  /** IST `YYYY-MM-DD` the alert says the money moved. */
  occurred_on: string
  /** UTC ISO-8601. */
  received_at: string
  status: BankAlertStatus
  /** Arrived after the newest import, so the next backup may still bring its row. */
  after_last_import: boolean
  matched_transaction_id: string | null
}

export interface BankAlertList {
  /** Newest first. */
  alerts: BankAlert[]
  counts: Record<BankAlertStatus, number>
  /** Days either side of the alert date a ledger row may fall on. */
  window_days: number
  /** IST `YYYY-MM-DD` start of the lookback. */
  since: string
  /**
   * More alerts occurred in the requested days than one read returns, so
   * `since` was moved up to the oldest whole day returned; `alerts` and
   * `counts` cover exactly the days from `since` on.
   */
  truncated: boolean
  last_import_at: string | null
}

/** The lookback the Data Health panel reads, in IST days. */
export const BANK_ALERT_DAYS = 60

/**
 * The absolute URL an automation posts alert text to. `API_BASE_URL` is empty
 * in local development, where Vite proxies `/api` on the page's own origin.
 */
export function bankAlertIngestUrl(): string {
  return `${API_BASE_URL || globalThis.location.origin}/api/ingest/text`
}

function assertBankAlertList(data: unknown): BankAlertList {
  const list = data as Partial<BankAlertList> | null
  if (!list || !Array.isArray(list.alerts) || !list.counts) {
    throw new Error('Unexpected bank alerts response')
  }
  return list as BankAlertList
}

export const bankAlertsService = {
  list: async (days: number = BANK_ALERT_DAYS): Promise<BankAlertList> => {
    const response = await apiClient.get<BankAlertList>('/api/bank-alerts', { params: { days } })
    return assertBankAlertList(response.data)
  },

  /** Ignore an alert (it stops counting as missing) or restore it. */
  setIgnored: async (id: number, ignored: boolean): Promise<{ id: number; ignored: boolean }> => {
    const response = await apiClient.patch<{ id: number; ignored: boolean }>(
      `/api/bank-alerts/${id}`,
      { ignored },
    )
    return response.data
  },
}

// ---------------------------------------------------------------------------
// localStorage keys (shared with BillCalendarPage)
// ---------------------------------------------------------------------------

export const CONFIRMED_SUBS_KEY = 'ledger-sync-confirmed-subscriptions'
export const MANUAL_SUBS_KEY = 'ledger-sync-manual-subscriptions'

// ---------------------------------------------------------------------------
// Manual subscription type
// ---------------------------------------------------------------------------

export interface ManualSubscription {
  id: string
  name: string
  amount: number
  frequency: string
  next_due: string
  category?: string
}

// ---------------------------------------------------------------------------
// Sort key type
// ---------------------------------------------------------------------------

export type SortKey = 'amount' | 'name' | 'last_occurrence' | 'annual_cost'

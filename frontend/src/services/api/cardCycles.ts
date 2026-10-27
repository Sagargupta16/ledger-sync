import { apiClient } from './client'

/**
 * `open` is the period still running. A closed statement is `nothing_due` when
 * it billed nothing and `paid` once payments since the close, oldest bill
 * first, covered it. Only the latest statement can be `due`, `partial` or
 * `overdue`; an older one that is not paid yet is `rolled_over`, because what
 * it still owes is inside the latest bill.
 */
export type CardCycleStatus =
  | 'open'
  | 'nothing_due'
  | 'paid'
  | 'partial'
  | 'due'
  | 'overdue'
  | 'rolled_over'

/**
 * One statement period, matching backend `schemas/card_cycles.py`. Dates are
 * IST `YYYY-MM-DD` days. `billed` is what the card owed when the period closed,
 * so an unpaid earlier balance is included; `spend` is the period's own
 * purchases less refunds and can be negative. `paid` never exceeds `billed`.
 */
export interface CardCycle {
  period_start: string
  statement_date: string
  due_date: string
  status: CardCycleStatus
  spend: number
  billed: number
  paid: number
  remaining: number
  paid_on: string | null
  paid_from_paying_account: boolean
}

/**
 * The flat fields repeat `cycles[1]` (latest statement) and `cycles[0]` (open
 * period). `carried_in` is the part of the latest bill that earlier statements
 * still owed once this period's payments were counted.
 */
export interface CardCycleCard {
  account_id: number
  name: string
  statement_day: number
  payment_day: number
  paying_account_id: number | null
  paying_account: string | null
  last_statement_date: string
  next_statement_date: string
  due_date: string
  days_to_due: number
  billed_amount: number
  paid_amount: number
  due_amount: number
  carried_in: number
  status: CardCycleStatus
  paid_on: string | null
  paid_from_paying_account: boolean
  unbilled_amount: number
  next_due_date: string
  days_to_next_due: number
  cycles: CardCycle[]
}

export interface PayingAccountCash {
  account_id: number
  name: string
  /** Signed ledger balance today; `cash_after_dues` can be negative too. */
  balance: number
  upcoming_dues: number
  unbilled: number
  cash_after_dues: number
  cards: string[]
}

export interface SkippedCard {
  account_id: number
  name: string
  reason: 'closed' | 'no_settings'
}

export interface CardCyclesResponse {
  as_of: string
  cards: CardCycleCard[]
  paying_accounts: PayingAccountCash[]
  skipped: SkippedCard[]
}

export interface CardCyclesParams {
  /** Closed statements returned per card, 1-24 (backend default 6). */
  history?: number
}

/**
 * Reject anything but the report shape (an unrouted demo request answers `[]`),
 * so callers get a query error instead of reading `cards` off the wrong value.
 */
function assertCardCycles(data: unknown): asserts data is CardCyclesResponse {
  const report = data as Partial<CardCyclesResponse> | null
  if (
    !report ||
    !Array.isArray(report.cards) ||
    !Array.isArray(report.paying_accounts) ||
    !Array.isArray(report.skipped)
  ) {
    throw new Error('Unexpected card cycles response')
  }
}

export const cardCyclesService = {
  async getCardCycles(params?: CardCyclesParams): Promise<CardCyclesResponse> {
    const response = await apiClient.get<unknown>('/api/card-cycles', { params })
    assertCardCycles(response.data)
    return response.data
  },
}

import { apiClient } from './client'

/**
 * `GET /api/safe-to-spend` and `/api/safe-to-spend/projection`
 * (backend `schemas/safe_to_spend.py`). Money is INR, dates are IST
 * `YYYY-MM-DD` keys, and a flow's `amount` is signed: positive is money in.
 */

export interface PayCycle {
  start: string
  next_payday: string
  /** Days from today up to the day before `next_payday`, today included. */
  days_left: number
  total_days: number
  /** The stored payday preference; null when the user never saved preferences. */
  payday: number | null
  basis: 'payday' | 'month_end'
  /** Usual day of the largest repeating income commitment or schedule, if any. */
  detected_payday: number | null
}

export interface LiquidPosition {
  gross: number
  liabilities: number
  net: number
  spendable_accounts: number
  card_accounts: number
  unclassified_accounts: number
}

export interface PlannedFlow {
  name: string
  account: string
  date: string
  amount: number
}

export interface ReserveCycle {
  start: string
  end: string
  income: number
  bills: number
}

export interface BillReserve {
  amount: number
  status: 'covered' | 'reserved' | 'no_recurring_income'
  cycles: ReserveCycle[]
}

export interface SpendPace {
  spent: number
  /** The cycle's allowance spread evenly, up to `as_of`. */
  expected: number
  /** Spent so far plus what is still safe to spend. */
  budget: number
  /** Average daily spend of the last 90 days times the days elapsed. */
  usual: number | null
  elapsed_days: number
  total_days: number
  as_of: string
}

export interface LowBalanceWarning {
  account: string
  date: string
  balance: number
  kind: 'below_zero' | 'below_threshold'
}

export interface SafeToSpend {
  as_of: string
  /** Date of the newest transaction the balances include. */
  balance_as_of: string | null
  threshold: number
  cycle: PayCycle
  liquid: LiquidPosition
  bills_before_payday: number
  bill_count: number
  /** Bills due before payday, soonest first (at most 12). */
  bills: PlannedFlow[]
  reserve: BillReserve
  safe_to_spend: number
  per_day: number
  /** Median discretionary spend per day, no-spend days counted. */
  typical_daily_spend: number
  pace: SpendPace | null
  low_balance: LowBalanceWarning | null
}

export interface BalanceSeries {
  name: string
  start_balance: number
  /** End-of-day balances, one per projection date. */
  balances: number[]
  lowest: number
  lowest_on: string
  below_zero_on: string | null
  below_threshold_on: string | null
  starts_below_zero: boolean
  daily_spend: number
  daily_transfer: number
}

export interface BalanceProjection {
  as_of: string
  balance_as_of: string | null
  days: number
  threshold: number
  dates: string[]
  total: BalanceSeries
  accounts: BalanceSeries[]
  events: PlannedFlow[]
  assumptions: {
    lookback_days: number
    /** Average discretionary spend per day on cash, bank and wallet accounts, big days included. */
    daily_spend: number
    transfer_months: string[]
    unassigned_flows: number
  }
}

export interface SafeToSpendParams {
  threshold?: number
}

export interface BalanceProjectionParams {
  days?: number
  threshold?: number
}

export const safeToSpendService = {
  async getSafeToSpend(params: SafeToSpendParams = {}): Promise<SafeToSpend> {
    const res = await apiClient.get<SafeToSpend>('/api/safe-to-spend', { params })
    return res.data
  },

  async getBalanceProjection(params: BalanceProjectionParams = {}): Promise<BalanceProjection> {
    const res = await apiClient.get<BalanceProjection>('/api/safe-to-spend/projection', { params })
    return res.data
  },
}

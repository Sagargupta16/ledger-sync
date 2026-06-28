export interface ChartDataPoint {
  month: string
  invested: number
  value: number
  /**
   * Historical only: what the portfolio *should* be worth at this month if
   * every contribution had compounded at the user's expected return from its
   * investment date. Lets the actual `value` be compared against the assumed
   * benchmark. Undefined on projection points (the projected `value` is itself
   * the expected-return path, so a second line there would be redundant).
   */
  expectedValue?: number
  isHistorical: boolean
}

export interface MutualFundAccount {
  name: string
  balance: number
}

export interface SIPTransfer {
  date: string
  amount: number
  note?: string | null
}

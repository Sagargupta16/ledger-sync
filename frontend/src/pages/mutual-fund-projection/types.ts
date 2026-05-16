export interface ChartDataPoint {
  month: string
  invested: number
  value: number
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

import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/types'
import { generateDemoFYSummaries, generateDemoMonthlySummaries } from '../demoAnalyticsV2'

function transfer(from: string, to: string, amount: number): Transaction {
  return {
    id: `${from}-${to}`,
    date: '2025-04-10',
    type: 'Transfer',
    amount,
    currency: 'INR',
    account: from,
    from_account: from,
    to_account: to,
    category: 'Transfer',
  }
}

describe('demo investment summary parity', () => {
  it('counts only external funding and preserves the monthly cash-flow sign', () => {
    const transactions = [
      transfer('Bank', 'Groww Mutual Funds', 10_000),
      transfer('Groww Mutual Funds', 'Groww Stocks', 10_000),
      transfer('Groww Stocks', 'Bank', 4_000),
    ]
    const fy = generateDemoFYSummaries(transactions)[0]
    const month = generateDemoMonthlySummaries(transactions)[0]

    expect(fy.investments_made).toBe(10_000)
    expect(month.transfers.net_investment).toBe(-6_000)
    expect(month.transfers.in).toBe(24_000)
    expect(month.transfers.out).toBe(24_000)
  })
})

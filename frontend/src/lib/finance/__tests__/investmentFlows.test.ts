import { describe, expect, it } from 'vitest'

import {
  investmentAccountDeltas,
  investmentAccountTest,
  investmentTransferDelta,
  netInvestmentTransferFlow,
  summarizeInvestmentTransfers,
  type InvestmentFlowTransaction,
} from '../investmentFlows'

const isInvestment = investmentAccountTest(['Fund A', 'Fund B', 'Retirement'])

const transfers: InvestmentFlowTransaction[] = [
  { type: 'Transfer', amount: 10000, from_account: 'Bank', to_account: 'Fund A' },
  { type: 'Transfer', amount: 10000, from_account: 'Fund A', to_account: 'Fund B' },
  { type: 'Transfer', amount: 4000, from_account: 'Fund B', to_account: 'Bank' },
]

describe('investment perimeter and account movements', () => {
  it('counts only new contributions less redemptions', () => {
    expect(transfers.map((tx) => investmentTransferDelta(tx, isInvestment))).toEqual([10000, 0, -4000])
    expect(netInvestmentTransferFlow(transfers, isInvestment)).toBe(6000)
  })

  it('keeps both internal legs so per-account balances still reconcile', () => {
    const balances: Record<string, number> = {}
    for (const tx of transfers) {
      for (const { account, amount } of investmentAccountDeltas(tx, isInvestment)) {
        balances[account] = (balances[account] ?? 0) + amount
      }
    }
    expect(balances).toEqual({ 'Fund A': 0, 'Fund B': 6000 })
  })

  it('uses the supplied predicate rather than account-name heuristics', () => {
    const configured = investmentAccountTest(['My future'])
    expect(investmentTransferDelta(
      { type: 'Transfer', amount: 250, from_account: 'Mutual Fund Bank', to_account: 'My future' },
      configured,
    )).toBe(250)
    expect(configured('My future')).toBe(true)
    expect(configured('my future')).toBe(false)
    expect(configured(undefined)).toBe(false)
  })

  it('does not turn income-funded holdings into transfer contributions', () => {
    const income = { type: 'Income', amount: 1000, account: 'Retirement' }
    const fee = { type: 'Expense', amount: 25, account: 'Retirement' }
    expect(netInvestmentTransferFlow([income, fee], isInvestment)).toBe(0)
    expect(investmentAccountDeltas(income, isInvestment)).toEqual([{ account: 'Retirement', amount: 1000 }])
    expect(investmentAccountDeltas(fee, isInvestment)).toEqual([{ account: 'Retirement', amount: -25 }])
  })

  it('preserves a full redemption and gives a same-account transfer zero net effect', () => {
    expect(investmentTransferDelta(
      { type: 'Transfer', amount: 1000, from_account: 'Fund A', to_account: 'Bank' },
      isInvestment,
    )).toBe(-1000)
    expect(investmentTransferDelta(
      { type: 'Transfer', amount: 1000, from_account: 'Fund A', to_account: 'Fund A' },
      isInvestment,
    )).toBe(0)
  })

  it('partitions transfer volume without including direct income or expenses', () => {
    const rows: InvestmentFlowTransaction[] = [
      ...transfers,
      { type: 'Transfer', amount: 2000, from_account: 'Bank', to_account: 'Wallet' },
      { type: 'Income', amount: 1000, account: 'Retirement' },
      { type: 'Expense', amount: 25, account: 'Fund B' },
    ]
    expect(summarizeInvestmentTransfers(rows, isInvestment)).toEqual({
      contributions: 10000,
      withdrawals: 4000,
      netContributions: 6000,
      internalTransfers: 10000,
      otherTransfers: 2000,
    })
  })

  it('preserves configured boundaries, internal volume and a negative net contribution', () => {
    const configured = investmentAccountTest(['My future'])
    const rows: InvestmentFlowTransaction[] = [
      { type: 'Transfer', amount: 250, from_account: 'Mutual Fund Bank', to_account: 'My future' },
      { type: 'Transfer', amount: 500, from_account: 'My future', to_account: 'Bank' },
      { type: 'Transfer', amount: 40, from_account: 'My future', to_account: 'My future' },
      { type: 'Transfer', amount: 80, from_account: 'PPF bank', to_account: 'Bank' },
    ]
    expect(summarizeInvestmentTransfers(rows, configured)).toEqual({
      contributions: 250,
      withdrawals: 500,
      netContributions: -250,
      internalTransfers: 40,
      otherTransfers: 80,
    })
    expect(netInvestmentTransferFlow(rows, configured)).toBe(-250)
  })
})

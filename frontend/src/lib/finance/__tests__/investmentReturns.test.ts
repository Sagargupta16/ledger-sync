import { describe, expect, it } from 'vitest'

import {
  classifyInvestmentReturn,
  computeInvestmentMetrics,
  countRealisedEvents,
  groupInvestmentReturnsByMonth,
  investmentReturnRules,
  type InvestmentReturnTransaction,
} from '../investmentReturns'

const interest = {
  date: '2026-08-15',
  type: 'Income',
  amount: 100,
  category: 'Investment Income',
  subcategory: 'Interest',
  note: 'Realized FD interest',
}

describe('recorded investment returns', () => {
  it('counts overlapping interest/profit keywords once in every readout', () => {
    const metrics = computeInvestmentMetrics([interest])
    expect(metrics.interestIncome).toBe(100)
    expect(metrics.investmentProfit).toBe(0)
    expect(metrics.netProfitLoss).toBe(100)
    expect(countRealisedEvents([interest])).toBe(1)
    expect(groupInvestmentReturnsByMonth([interest])).toEqual([
      { month: '2026-08', income: 100, expenses: 0, net: 100, cumulative: 100 },
    ])
  })

  it('prefers the explicit subtype over conflicting note keywords', () => {
    expect(classifyInvestmentReturn({
      ...interest, subcategory: 'Stock Market Profit', note: 'Reinvested dividend profit',
    })).toBe('investmentProfit')
    expect(classifyInvestmentReturn({
      ...interest, subcategory: 'Dividends', note: 'Realized interest and gain',
    })).toBe('dividendIncome')
  })

  it('never reads the note as investment-income evidence', () => {
    // Shared rule (2026-09-30): keys or category/subcategory keywords only.
    expect(classifyInvestmentReturn({
      ...interest, subcategory: undefined, note: 'INT CR for August',
    })).toBeNull()
    expect(classifyInvestmentReturn({
      ...interest, subcategory: undefined, note: 'Q3 MF STCG Profit',
    })).toBeNull()
  })

  it('uses the default keywords on category or subcategory while unconfigured', () => {
    // xs_ret.ts: neither key is a shipped default, both carry a default keyword.
    expect(classifyInvestmentReturn({
      type: 'Income', amount: 4000, category: 'Other Income', subcategory: 'Savings Account Interest',
    })).toBe('interestIncome')
    expect(classifyInvestmentReturn({
      type: 'Income', amount: 9000, category: 'Investment Income', subcategory: 'Mutual Fund Gains',
    })).toBe('investmentProfit')
    // "returns" is plural only: a deposit coming back is not a return.
    expect(classifyInvestmentReturn({
      type: 'Income', amount: 500, category: 'Refunds & Cashbacks', subcategory: 'Deposit Return',
    })).toBeNull()
  })

  it('honours a configured key list exactly, case-insensitively, with no keyword fallback', () => {
    const rules = investmentReturnRules({
      taxable: ['Employment Income::Salary'],
      investmentReturns: ['investment income::dividends'],
      nonTaxable: [],
      other: [],
    })
    expect(classifyInvestmentReturn({ ...interest, subcategory: 'Dividends' }, rules)).toBe('dividendIncome')
    expect(classifyInvestmentReturn({
      type: 'Income', amount: 4000, category: 'Other Income', subcategory: 'Savings Account Interest',
    }, rules)).toBeNull()
    expect(computeInvestmentMetrics([{ ...interest, subcategory: 'Dividends' }, interest], rules))
      .toMatchObject({ dividendIncome: 100, interestIncome: 0, eventCount: 1 })
  })

  it('never lets a keyword re-claim a key the user filed under another income list', () => {
    const rules = investmentReturnRules({
      taxable: [], investmentReturns: [], nonTaxable: [], other: ['Other Income::Savings Account Interest'],
    })
    expect(classifyInvestmentReturn({
      type: 'Income', amount: 4000, category: 'Other Income', subcategory: 'Savings Account Interest',
    }, rules)).toBeNull()
  })

  it.each([
    { category: 'Trading', subcategory: 'Charges', note: '' },
    { category: 'Trading', subcategory: '', note: 'Monthly fee' },
    { category: 'Investment Expenses', subcategory: 'Demat', note: 'Annual maintenance charge' },
    { category: 'Investment Expenses', subcategory: 'Fees', note: 'Transaction processing' },
  ])('recognizes split fee context: $category / $subcategory / $note', (fields) => {
    const tx = { ...interest, type: 'Expense', amount: 75, ...fields }
    const metrics = computeInvestmentMetrics([tx])
    expect(metrics).toMatchObject({
      brokerFees: 75, investmentLoss: 0, totalIncome: 0,
      totalExpenses: 75, netProfitLoss: -75, eventCount: 1,
    })
    expect(countRealisedEvents([tx])).toBe(1)
    expect(groupInvestmentReturnsByMonth([tx])).toEqual([
      { month: '2026-08', income: 0, expenses: 75, net: -75, cumulative: -75 },
    ])
  })

  it('preserves exclusive fee and loss buckets before using combined context', () => {
    const transactions = [
      { ...interest, type: 'Expense', amount: 10, category: 'Investment Expenses', subcategory: 'Brokerage', note: 'Trading loss' },
      { ...interest, type: 'Expense', amount: 20, category: 'Investment Expenses', subcategory: 'Capital Loss', note: 'Brokerage charge' },
      { ...interest, type: 'Expense', amount: 30, category: 'Trading', subcategory: 'Charges', note: 'Capital loss' },
    ]
    expect(transactions.map((tx) => classifyInvestmentReturn(tx))).toEqual([
      'brokerFees', 'investmentLoss', 'investmentLoss',
    ])
    expect(computeInvestmentMetrics(transactions)).toMatchObject({
      brokerFees: 10, investmentLoss: 50, totalExpenses: 60, netProfitLoss: -60, eventCount: 3,
    })
  })

  it('never infers a gain from transfers, redemptions, salary or RSU receipts', () => {
    const unrelated: InvestmentReturnTransaction[] = [
      { ...interest, type: 'Transfer', note: 'Realized investment redemption' },
      { ...interest, subcategory: 'Redemption', note: 'Principal and interest returned' },
      { ...interest, subcategory: 'RSUs', note: 'Realized value of vested shares' },
      { ...interest, category: 'Salary', subcategory: 'Bonus', note: 'Profit sharing' },
      { ...interest, subcategory: undefined, note: 'Unrealized gain' },
      { ...interest, subcategory: undefined, note: 'Sale proceeds including profit' },
    ]
    expect(unrelated.map((tx) => classifyInvestmentReturn(tx))).toEqual([null, null, null, null, null, null])
    expect(computeInvestmentMetrics(unrelated).netProfitLoss).toBe(0)
    expect(countRealisedEvents(unrelated)).toBe(0)
  })

  it('reconciles exact P&L with monthly outcomes and fee/loss classification', () => {
    const transactions = [
      { ...interest, amount: 100.25 },
      { ...interest, date: '2026-09-01', amount: 40.5, subcategory: 'Dividends' },
      { ...interest, type: 'Expense', category: 'Investment Expenses', subcategory: 'Brokerage', amount: 10.75, note: 'Trading loss fee' },
      { ...interest, type: 'Expense', category: 'Investment Expenses', subcategory: 'Capital Loss', amount: 20, note: '' },
      { ...interest, type: 'Expense', category: 'Food', subcategory: 'Waste loss', amount: 800, note: '' },
    ]
    const metrics = computeInvestmentMetrics(transactions)
    const months = groupInvestmentReturnsByMonth(transactions)
    expect(metrics).toEqual({
      dividendIncome: 40.5, interestIncome: 100.25, investmentProfit: 0,
      brokerFees: 10.75, investmentLoss: 20, totalIncome: 140.75,
      totalExpenses: 30.75, netProfitLoss: 110, eventCount: 4,
    })
    expect(months.at(-1)?.cumulative).toBe(metrics.netProfitLoss)
    expect(months.reduce((total, month) => total + month.income, 0)).toBe(metrics.totalIncome)
    expect(months.reduce((total, month) => total + month.expenses, 0)).toBe(metrics.totalExpenses)
  })
})

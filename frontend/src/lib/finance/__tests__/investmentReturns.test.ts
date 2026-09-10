import { describe, expect, it } from 'vitest'

import {
  classifyInvestmentReturn,
  computeInvestmentMetrics,
  countRealisedEvents,
  groupInvestmentReturnsByMonth,
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

  it('uses notes only when a return subtype was not recorded', () => {
    expect(classifyInvestmentReturn({
      ...interest, subcategory: undefined, note: 'INT CR for August',
    })).toBe('interestIncome')
    expect(classifyInvestmentReturn({
      ...interest, subcategory: undefined, note: 'Q3 MF STCG Profit',
    })).toBe('investmentProfit')
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
    expect(transactions.map(classifyInvestmentReturn)).toEqual([
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
    expect(unrelated.map(classifyInvestmentReturn)).toEqual([null, null, null, null, null, null])
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

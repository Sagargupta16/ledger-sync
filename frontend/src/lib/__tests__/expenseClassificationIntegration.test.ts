/**
 * Guards the call sites wired to the capital-loss classifier. A unit-tested
 * classifier that nothing imports changes no number on screen, so each case
 * here asserts the aggregate a page actually renders.
 */
import { describe, it, expect } from 'vitest'

import { computeCategoryBreakdown } from '@/lib/transactionUtils'
import { classifyTransaction, createEmptyBucket } from '@/components/analytics/health/healthScoreAnalysis'
import { aggregateDayTotals } from '@/pages/year-in-review/heatmapUtils'
import type { Transaction } from '@/types'

const row = (over: Partial<Transaction>): Transaction => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  date: '2026-03-31',
  amount: 100,
  type: 'Expense',
  category: 'Food & Dining',
  account: 'Bank: Main',
  ...over,
})

const LOSS = row({
  id: 'loss',
  amount: 20000,
  category: 'Investment Expenses',
  subcategory: 'F&O Loss',
  account: 'Stocks: Broker',
})
const BROKERAGE = row({
  id: 'fee',
  amount: 500,
  category: 'Investment Expenses',
  subcategory: 'Brokerage & Other Fees',
  account: 'Stocks: Broker',
})
const GROCERIES = row({ id: 'food', amount: 1500, subcategory: 'Groceries' })

describe('computeCategoryBreakdown', () => {
  it('omits the capital loss from the category ranking', () => {
    const breakdown = computeCategoryBreakdown([GROCERIES, BROKERAGE, LOSS])
    expect(breakdown['Food & Dining']).toBe(1500)
    // Brokerage is a real cost of investing and stays; the 20000 loss does not.
    expect(breakdown['Investment Expenses']).toBe(500)
  })

  it('keeps the loss out of the total that drives the ranking', () => {
    const withLoss = computeCategoryBreakdown([GROCERIES, LOSS])
    const withoutLoss = computeCategoryBreakdown([GROCERIES])
    const sum = (b: Record<string, number>) => Object.values(b).reduce((a, v) => a + v, 0)
    expect(sum(withLoss)).toBe(sum(withoutLoss))
  })
})

describe('health score classifyTransaction', () => {
  const bucketFor = (txs: Transaction[]) => {
    const bucket = createEmptyBucket()
    for (const tx of txs) classifyTransaction(tx, bucket, () => false)
    return bucket
  }

  it('does not count a realised loss as monthly expense', () => {
    expect(bucketFor([GROCERIES, LOSS]).expense).toBe(1500)
  })

  it('still counts brokerage as expense', () => {
    expect(bucketFor([GROCERIES, BROKERAGE]).expense).toBe(2000)
  })

  it('keeps the savings rate from being depressed by the loss', () => {
    const income = row({ id: 'pay', type: 'Income', amount: 50000, category: 'Employment Income' })
    const bucket = bucketFor([income, GROCERIES, LOSS])
    expect(bucket.income).toBe(50000)
    expect((bucket.income - bucket.expense) / bucket.income).toBeCloseTo(0.97, 4)
  })
})

describe('year-in-review heatmap', () => {
  it('does not render a loss day as an extreme-spend day', () => {
    const { dayExpenses } = aggregateDayTotals([GROCERIES, LOSS], '2026-01-01', '2026-12-31')
    expect(dayExpenses['2026-03-31']).toBe(1500)
  })

  it('leaves income untouched', () => {
    const income = row({ id: 'pay', type: 'Income', amount: 50000, category: 'Employment Income' })
    const { dayIncomes } = aggregateDayTotals([income, LOSS], '2026-01-01', '2026-12-31')
    expect(dayIncomes['2026-03-31']).toBe(50000)
  })
})

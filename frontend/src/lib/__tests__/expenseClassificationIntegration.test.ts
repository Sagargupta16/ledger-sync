/**
 * Guards the call sites wired to the capital-loss classifier. A unit-tested
 * classifier that nothing imports changes no number on screen, so each case
 * here asserts the aggregate a page actually renders.
 *
 * Since 2026-09-30 the rule is the backend's: only a key the user classified
 * (`capital_loss_categories`) leaves spending. A row whose NAME reads like a
 * loss is still spending until then -- the fail-safe direction, and the same
 * answer `/totals` gives -- so these call sites count the unclassified loss.
 */
import { describe, it, expect } from 'vitest'

import { classifyTransaction, createEmptyBucket } from '@/components/analytics/health/healthScoreAnalysis'
import { capitalLossConfig } from '@/lib/expenseClassification'
import { aggregateFromDailySummaries, buildDayCells } from '@/pages/year-in-review/heatmapUtils'
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

describe('health score classifyTransaction', () => {
  const bucketFor = (txs: Transaction[], lossCategories: string[] = []) => {
    const bucket = createEmptyBucket()
    const config = capitalLossConfig(lossCategories)
    for (const tx of txs) classifyTransaction(tx, bucket, () => false, undefined, config)
    return bucket
  }

  it('counts an unclassified loss-named row as monthly expense, like /totals', () => {
    expect(bucketFor([GROCERIES, LOSS]).expense).toBe(21500)
  })

  it('keeps a classified loss out of monthly expense, like /totals', () => {
    const bucket = bucketFor([GROCERIES, BROKERAGE, LOSS], ['Investment Expenses::F&O Loss'])
    expect(bucket.expense).toBe(2000)
    expect(bucket.categories['Investment Expenses']).toBe(500)
  })

  it('still counts brokerage as expense', () => {
    expect(bucketFor([GROCERIES, BROKERAGE]).expense).toBe(2000)
  })
})

describe('year-in-review heatmap (daily rollups)', () => {
  // The rollup row for a day holding 50,000 of salary, 1,500 of groceries and a
  // CLASSIFIED 20,000 realised loss: `_accumulate_daily` keeps the loss out of
  // `expense` and subtracts it from `net`.
  const LOSS_DAY = { date: '2026-03-31', income: 50000, expense: 1500, net: 28500 }

  it('does not render a classified-loss day as an extreme-spend day', () => {
    const { dayExpenses } = aggregateFromDailySummaries([LOSS_DAY], '2026-01-01', '2026-12-31')
    expect(dayExpenses['2026-03-31']).toBe(1500)
  })

  it('keeps the loss in the day net, so savings still reconcile', () => {
    const { dayExpenses, dayIncomes, dayNets } = aggregateFromDailySummaries(
      [LOSS_DAY],
      '2026-03-01',
      '2026-03-31',
    )
    expect(dayIncomes['2026-03-31']).toBe(50000)
    const { cells } = buildDayCells(
      new Date(2026, 2, 1),
      new Date(2026, 2, 31),
      dayExpenses,
      dayIncomes,
      dayNets,
    )
    expect(cells.at(-1)?.net).toBe(28500)
  })
})

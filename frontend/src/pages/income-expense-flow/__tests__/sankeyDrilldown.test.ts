import { describe, expect, it } from 'vitest'

import type { Transaction } from '@/types'

import {
  attachOverviewDrills,
  buildCategoryView,
  buildOtherView,
  buildOverviewView,
  countSubBuckets,
  foldTopWithOther,
  SANKEY_TOP_N,
  type DrillCrumb,
} from '../sankeyDrilldown'

function txn(
  type: 'Income' | 'Expense',
  category: string,
  amount: number,
  subcategory?: string,
): Transaction {
  return {
    id: `${type}-${category}-${subcategory ?? 'none'}-${amount}`,
    date: '2026-05-10',
    amount,
    type,
    category,
    subcategory,
    account: 'Bank',
  }
}

describe('foldTopWithOther', () => {
  it('keeps all categories when at or under the cap', () => {
    const { entries, tail } = foldTopWithOther({ A: 300, B: 200, C: 100 }, 'Other Expense')
    expect(entries.map((e) => e.name)).toEqual(['A', 'B', 'C'])
    expect(tail).toEqual([])
  })

  it('folds the tail into Other (n) and preserves the grand total', () => {
    const byCategory: Record<string, number> = {}
    for (let i = 0; i < SANKEY_TOP_N + 3; i++) byCategory[`Cat${i}`] = 1000 - i * 10
    const { entries, tail } = foldTopWithOther(byCategory, 'Other Expense')
    expect(entries).toHaveLength(SANKEY_TOP_N + 1)
    expect(entries.at(-1)!.name).toBe('Other Expense (3)')
    expect(tail).toHaveLength(3)
    const visible = entries.reduce((s, e) => s + e.amount, 0)
    const total = Object.values(byCategory).reduce((a, b) => a + b, 0)
    expect(visible).toBe(total)
  })
})

describe('countSubBuckets + attachOverviewDrills', () => {
  const txns = [
    txn('Expense', 'Family', 500, 'Parents'),
    txn('Expense', 'Family', 300, 'Sister'),
    txn('Expense', 'Rent', 15000), // single bucket -> leaf
    txn('Income', 'Salary', 90000, 'Base'),
    txn('Income', 'Salary', 10000, 'Bonus'),
  ]

  it('categories with >= 2 sub-buckets get a category drill; single-bucket ones stay leaves', () => {
    const buckets = countSubBuckets(txns)
    const entries = attachOverviewDrills(
      [
        { name: 'Family', amount: 800 },
        { name: 'Rent', amount: 15000 },
      ],
      [],
      'expense',
      buckets.expense,
    )
    expect(entries[0].drill).toEqual({ label: 'Family', view: 'category', flow: 'expense' })
    expect(entries[1].drill).toBeNull()
  })

  it('the folded Other entry drills into its tail', () => {
    const buckets = countSubBuckets(txns)
    const entries = attachOverviewDrills(
      [
        { name: 'Family', amount: 800 },
        { name: 'Other Expense (2)', amount: 999 },
      ],
      [
        { name: 'Snacks', amount: 600 },
        { name: 'Books', amount: 399 },
      ],
      'expense',
      buckets.expense,
    )
    const other = entries[1]
    expect(other.drill?.view).toBe('other')
    expect(other.drill?.tail?.map((t) => t.name)).toEqual(['Snacks', 'Books'])
  })
})

describe('buildCategoryView', () => {
  const txns = [
    txn('Expense', 'Family', 500, 'Parents'),
    txn('Expense', 'Family', 300, 'Sister'),
    txn('Expense', 'Family', 200), // no subcategory
    txn('Expense', 'Rent', 15000),
    txn('Income', 'Salary', 90000, 'Base'),
  ]
  const crumb: DrillCrumb = { label: 'Family', view: 'category', flow: 'expense' }

  it('builds parent -> subcategory links whose values sum to the category total', () => {
    const view = buildCategoryView(txns, crumb)
    expect(view.nodes[0].name).toBe('Family')
    const linkSum = view.links.reduce((s, l) => s + l.value, 0)
    expect(linkSum).toBe(1000)
    expect(view.rowsTotal).toBe(1000)
    // Every link starts at the parent (index 0) for an expense drill.
    expect(view.links.every((l) => l.source === 0)).toBe(true)
    const names = view.nodes.map((n) => n.name)
    expect(names).toContain('Parents')
    expect(names).toContain('Sister')
    expect(names).toContain('(no subcategory)')
  })

  it('orients income drills subcategories -> parent (money flows left to right)', () => {
    const incomeTxns = [txn('Income', 'Salary', 90000, 'Base'), txn('Income', 'Salary', 10000, 'Bonus')]
    const view = buildCategoryView(incomeTxns, { label: 'Salary', view: 'category', flow: 'income' })
    const parentIndex = view.nodes.length - 1
    expect(view.nodes[parentIndex].name).toBe('Salary')
    expect(view.links.every((l) => l.target === parentIndex)).toBe(true)
    expect(view.links.reduce((s, l) => s + l.value, 0)).toBe(100000)
  })

  it('never emits zero or negative links (recharts NaN-layout guard)', () => {
    const weird = [txn('Expense', 'Family', 500, 'Parents'), txn('Expense', 'Family', 0, 'Zero')]
    const view = buildCategoryView(weird, crumb)
    expect(view.links.every((l) => l.value > 0)).toBe(true)
  })
})

describe('buildOtherView', () => {
  it('unfolds the tail with one link per category', () => {
    const crumb: DrillCrumb = {
      label: 'Other Expense (2)',
      view: 'other',
      flow: 'expense',
      tail: [
        { name: 'Snacks', amount: 600, drill: null },
        { name: 'Books', amount: 400, drill: null },
      ],
    }
    const view = buildOtherView(crumb)
    expect(view.nodes.map((n) => n.name)).toEqual(['Other Expense (2)', 'Snacks', 'Books'])
    expect(view.links.reduce((s, l) => s + l.value, 0)).toBe(1000)
  })
})

describe('buildOverviewView', () => {
  it('reproduces the classic topology with per-node meta', () => {
    const view = buildOverviewView({
      incomeEntries: [{ name: 'Salary', amount: 100000 }],
      expenseEntries: [{ name: 'Family', amount: 30000 }],
      totalIncome: 100000,
      totalExpense: 30000,
      netSavings: 70000,
    })
    const names = view.nodes.map((n) => n.name)
    expect(names).toEqual(['Salary', 'Total Income', 'Savings', 'Expenses', 'Family'])
    // meta values line up with node order
    expect(view.meta[0].value).toBe(100000)
    expect(view.meta[2].value).toBe(70000)
    // income link + 2 hub links + 1 expense link
    expect(view.links).toHaveLength(4)
  })

  it('omits the savings link in a deficit period', () => {
    const view = buildOverviewView({
      incomeEntries: [{ name: 'Salary', amount: 50000 }],
      expenseEntries: [{ name: 'Family', amount: 60000 }],
      totalIncome: 50000,
      totalExpense: 60000,
      netSavings: -10000,
    })
    const savingsIndex = view.nodes.findIndex((n) => n.name === 'Savings')
    expect(view.links.some((l) => l.target === savingsIndex)).toBe(false)
  })
})

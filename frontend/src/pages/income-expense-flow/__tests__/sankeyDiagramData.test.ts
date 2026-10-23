import { describe, expect, it } from 'vitest'

import { computeSankeyLayout } from '@/components/charts/sankeyLayout'
import type { Transaction } from '@/types'

import { toFlowDiagram, type FlowDiagram } from '../sankeyDiagramData'
import {
  buildCategoryView,
  buildOtherView,
  buildOverviewView,
  tdsAtSourceLabel,
  type DrillCrumb,
} from '../sankeyDrilldown'

function txn(type: 'Income' | 'Expense', category: string, amount: number, subcategory?: string): Transaction {
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

const ids = (diagram: FlowDiagram) => diagram.nodes.map((node) => node.id)
const node = (diagram: FlowDiagram, id: string) => diagram.nodes.find((candidate) => candidate.id === id)
/** The kit's layout throws on a repeated id or a link to a missing node, so every diagram must lay out. */
const laysOut = (diagram: FlowDiagram) => computeSankeyLayout(diagram, { width: 800, height: 600 })

const familyCrumb: DrillCrumb = { label: 'Family', view: 'category', flow: 'expense' }
const familyTxns = [txn('Expense', 'Family', 500, 'Parents'), txn('Expense', 'Family', 300, 'Sister')]
const counts = { income: 1, expense: 2 }

describe('toFlowDiagram: overview', () => {
  const view = buildOverviewView({
    incomeEntries: [{ name: 'Salary', amount: 100000 }],
    // An expense category may share a branch's name; ids are by role, not by name.
    expenseEntries: [{ name: 'Family', amount: 30000, drill: familyCrumb }, { name: 'Savings', amount: 5000 }],
    totalIncome: 100000,
    totalExpense: 35000,
    netSavings: 57000,
    totalTax: 8000,
  })
  const diagram = toFlowDiagram(view, [], counts)

  it('keys entries by flow and name and the fixed middle block by role', () => {
    expect(ids(diagram)).toEqual([
      'income:Salary', 'flow:gross', 'flow:tax', 'flow:savings', 'flow:expenses', 'expense:Family', 'expense:Savings',
    ])
    expect(diagram.totalLabel).toBe('total income')
    expect(() => laysOut(diagram)).not.toThrow()
  })

  it('carries each node value, share and drill target', () => {
    expect(node(diagram, 'expense:Family')).toMatchObject({
      label: 'Family', displayValue: 30000, detail: '30.0%', selectable: true, meta: { drill: familyCrumb },
    })
    expect(node(diagram, 'income:Salary')?.selectable).toBe(false)
    expect(node(diagram, 'flow:gross')?.detail).toBe('100.0%')
  })

  it('colours ribbons into the hub by their source and every other ribbon by its target', () => {
    const color = (id: string) => node(diagram, id)?.color
    const link = (source: string, target: string) => diagram.links.find((l) => l.source === source && l.target === target)
    expect(link('income:Salary', 'flow:gross')?.color).toBe(color('income:Salary'))
    expect(link('flow:gross', 'flow:tax')?.color).toBe(color('flow:tax'))
    expect(link('flow:expenses', 'expense:Family')?.color).toBe(color('expense:Family'))
    expect(diagram.links.reduce((sum, l) => sum + l.value, 0)).toBe(view.links.reduce((sum, l) => sum + l.value, 0))
  })

  it('drops the orphan Savings node in a deficit period', () => {
    const deficit = toFlowDiagram(buildOverviewView({
      incomeEntries: [{ name: 'Salary', amount: 50000 }],
      expenseEntries: [{ name: 'Family', amount: 60000 }],
      totalIncome: 50000,
      totalExpense: 60000,
      netSavings: -10000,
    }), [], { income: 1, expense: 1 })
    expect(ids(deficit)).toEqual(['income:Salary', 'flow:gross', 'flow:expenses', 'expense:Family'])
    expect(() => laysOut(deficit)).not.toThrow()
  })

  it('names the gross pool when computed TDS feeds it', () => {
    const gross = toFlowDiagram(buildOverviewView({
      incomeEntries: [{ name: 'Salary', amount: 100000 }],
      expenseEntries: [{ name: 'Family', amount: 30000 }],
      totalIncome: 100000,
      totalExpense: 30000,
      netSavings: 70000,
      totalTax: 12000,
      tdsAtSource: 12000,
    }), [], { income: 1, expense: 1 })
    expect(ids(gross).slice(0, 3)).toEqual(['income:Salary', 'flow:tds', 'flow:gross'])
    expect(gross.totalLabel).toBe('gross income')
  })
})

describe('toFlowDiagram: drill levels keep the ids they share', () => {
  it('makes the drilled expense category the parent of its subcategories', () => {
    const drilled = toFlowDiagram(buildCategoryView(familyTxns, familyCrumb), [familyCrumb], counts)
    expect(ids(drilled)).toEqual(['expense:Family', 'expense:Family/Parents', 'expense:Family/Sister'])
    expect(drilled.totalLabel).toBe('Family')
    expect(drilled.links.map((l) => l.color)).toEqual(drilled.nodes.slice(1).map((n) => n.color))
  })

  it('puts an income parent last and colours ribbons by the subcategory feeding it', () => {
    const salaryCrumb: DrillCrumb = { label: 'Salary', view: 'category', flow: 'income' }
    const salary = [txn('Income', 'Salary', 90000, 'Base'), txn('Income', 'Salary', 10000, 'Bonus')]
    const drilled = toFlowDiagram(buildCategoryView(salary, salaryCrumb), [salaryCrumb], counts)
    expect(ids(drilled)).toEqual(['income:Salary/Base', 'income:Salary/Bonus', 'income:Salary'])
    expect(drilled.links.map((l) => l.color)).toEqual(drilled.nodes.slice(0, -1).map((n) => n.color))
  })

  it('keeps a category inside "Other" on one id there and in its own drill', () => {
    const snacksCrumb: DrillCrumb = { label: 'Snacks', view: 'category', flow: 'expense' }
    const otherCrumb: DrillCrumb = {
      label: 'Other Expense (2)', view: 'other', flow: 'expense',
      tail: [{ name: 'Snacks', amount: 600, drill: snacksCrumb }, { name: 'Books', amount: 400, drill: null }],
    }
    expect(ids(toFlowDiagram(buildOtherView(otherCrumb), [otherCrumb], counts)))
      .toEqual(['expense:Other Expense (2)', 'expense:Snacks', 'expense:Books'])
    const snacks = [txn('Expense', 'Snacks', 400, 'Chips'), txn('Expense', 'Snacks', 200, 'Tea')]
    expect(ids(toFlowDiagram(buildCategoryView(snacks, snacksCrumb), [otherCrumb, snacksCrumb], counts))[0]).toBe('expense:Snacks')
  })

  it('opens both kinds of Tax drill from the overview Tax node', () => {
    const incomeTaxCrumb: DrillCrumb = { label: 'Income Tax', view: 'category', flow: 'expense' }
    const taxCrumb: DrillCrumb = {
      label: 'Tax', view: 'other', flow: 'expense',
      tail: [{ name: 'Income Tax', amount: 5000, drill: incomeTaxCrumb }, { name: tdsAtSourceLabel('new'), amount: 3000, drill: null }],
    }
    const taxView = toFlowDiagram(buildOtherView(taxCrumb), [taxCrumb], counts)
    expect(ids(taxView).slice(0, 2)).toEqual(['flow:tax', 'expense:Income Tax'])
    const incomeTax = buildCategoryView([txn('Expense', 'Income Tax', 3000, 'Advance'), txn('Expense', 'Income Tax', 2000, 'Self')], incomeTaxCrumb)
    // Straight from the overview (one tax entry) it is the Tax node; from the Tax breakdown, that child.
    expect(ids(toFlowDiagram(incomeTax, [incomeTaxCrumb], counts))[0]).toBe('flow:tax')
    expect(ids(toFlowDiagram(incomeTax, [taxCrumb, incomeTaxCrumb], counts))[0]).toBe('expense:Income Tax')
  })

  it('suffixes a repeated name so the layout never sees a duplicate id', () => {
    const repeated: DrillCrumb = {
      label: 'Other Expense (2)', view: 'other', flow: 'expense',
      tail: [{ name: 'Books', amount: 600, drill: null }, { name: 'Books', amount: 400, drill: null }],
    }
    const diagram = toFlowDiagram(buildOtherView(repeated), [repeated], counts)
    expect(ids(diagram)).toEqual(['expense:Other Expense (2)', 'expense:Books', 'expense:Books#1'])
    expect(() => laysOut(diagram)).not.toThrow()
  })
})

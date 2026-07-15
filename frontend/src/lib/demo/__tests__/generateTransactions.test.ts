import { describe, expect, it } from 'vitest'

import { generateDemoTransactions } from '../generateTransactions'
import { DEMO_MONTHS } from '../demoTxHelpers'

const txs = generateDemoTransactions()

function monthKey(date: string): string {
  return date.slice(0, 7)
}

describe('generateDemoTransactions', () => {
  it('is deterministic', () => {
    const again = generateDemoTransactions()
    expect(again.length).toBe(txs.length)
    expect(again[0]).toEqual(txs[0])
    expect(again.at(-1)).toEqual(txs.at(-1))
  })

  it('spans the full 48-month horizon', () => {
    const months = new Set(txs.map((t) => monthKey(t.date)))
    expect(months.size).toBe(DEMO_MONTHS)
  })

  it('is sorted newest-first', () => {
    for (let i = 1; i < txs.length; i++) {
      expect(txs[i - 1].date >= txs[i].date).toBe(true)
    }
  })

  it('salary grows over the horizon (appraisal curve)', () => {
    const salaries = txs
      .filter((t) => t.subcategory === 'Salary')
      .sort((a, b) => a.date.localeCompare(b.date))
    expect(salaries.length).toBe(DEMO_MONTHS)
    const first = salaries[0].amount
    const last = salaries.at(-1)!.amount
    // ~9.5%/yr + one promotion over 4 years => at least 40% total growth.
    expect(last / first).toBeGreaterThan(1.4)
    expect(last / first).toBeLessThan(2.0)
  })

  it('rent steps up across lease renewals but is flat within a lease', () => {
    const rents = txs
      .filter((t) => t.subcategory === 'Rent')
      .sort((a, b) => a.date.localeCompare(b.date))
    expect(rents.length).toBe(DEMO_MONTHS)
    const distinct = [...new Set(rents.map((r) => r.amount))]
    // 48 months / 11-month leases => 4-5 distinct rent levels, ascending.
    expect(distinct.length).toBeGreaterThanOrEqual(4)
    expect(distinct).toEqual([...distinct].sort((a, b) => a - b))
  })

  it('festival months (Oct/Nov) spend more than adjacent months on average', () => {
    const monthlyExpense = new Map<string, number>()
    for (const t of txs) {
      if (t.type !== 'Expense') continue
      const mk = monthKey(t.date)
      monthlyExpense.set(mk, (monthlyExpense.get(mk) ?? 0) + t.amount)
    }
    let festivalTotal = 0
    let festivalCount = 0
    let otherTotal = 0
    let otherCount = 0
    for (const [mk, total] of monthlyExpense) {
      const month = Number(mk.slice(5, 7))
      if (month === 10 || month === 11) {
        festivalTotal += total
        festivalCount++
      } else {
        otherTotal += total
        otherCount++
      }
    }
    const festivalAvg = festivalTotal / festivalCount
    const otherAvg = otherTotal / otherCount
    expect(festivalAvg).toBeGreaterThan(otherAvg)
  })

  it('keeps a plausible savings rate (income exceeds expenses by 20-60%)', () => {
    const income = txs.filter((t) => t.type === 'Income').reduce((s, t) => s + t.amount, 0)
    const expense = txs.filter((t) => t.type === 'Expense').reduce((s, t) => s + t.amount, 0)
    const savingsRate = (income - expense) / income
    expect(savingsRate).toBeGreaterThan(0.2)
    expect(savingsRate).toBeLessThan(0.6)
  })

  it('contains the life-event streams (EMI, insurance, vacation, gadget)', () => {
    const subcats = new Set(txs.map((t) => t.subcategory))
    expect(subcats.has('Consumer Durable EMI')).toBe(true)
    expect(subcats.has('Insurance')).toBe(true)
    expect(subcats.has('Vacation')).toBe(true)
    // EMI runs exactly 12 months.
    expect(txs.filter((t) => t.subcategory === 'Consumer Durable EMI').length).toBe(12)
    // Annual insurance premium appears ~4 times (once per year).
    const health = txs.filter((t) => t.note === 'Health Insurance Annual Premium')
    expect(health.length).toBeGreaterThanOrEqual(3)
    expect(health.length).toBeLessThanOrEqual(5)
  })

  it('carries tags for the tag facet/filter surfaces', () => {
    const tagged = txs.filter((t) => (t.tags ?? []).length > 0)
    expect(tagged.length).toBeGreaterThan(20)
    const names = new Set(tagged.flatMap((t) => t.tags ?? []))
    expect(names.has('festival')).toBe(true)
  })

  it('every credit-card month with spend gets a bill payment', () => {
    // Sample: the Swiggy CC in the 10th month of the series.
    const swiggyMonths = new Set(
      txs
        .filter((t) => t.account === 'Swiggy HDFC Credit Card' && t.type === 'Expense')
        .map((t) => monthKey(t.date)),
    )
    const paymentMonths = new Set(
      txs
        .filter(
          (t) => t.type === 'Transfer' && t.to_account === 'Swiggy HDFC Credit Card',
        )
        .map((t) => monthKey(t.date)),
    )
    for (const mk of swiggyMonths) {
      expect(paymentMonths.has(mk)).toBe(true)
    }
  })
})

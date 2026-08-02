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
    expect(again).toHaveLength(txs.length)
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
    expect(salaries).toHaveLength(DEMO_MONTHS)
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
    expect(rents).toHaveLength(DEMO_MONTHS)
    const distinct = [...new Set(rents.map((r) => r.amount))]
    // 48 months / 11-month leases => 4-5 distinct rent levels, ascending.
    expect(distinct.length).toBeGreaterThanOrEqual(4)
    expect(distinct).toEqual([...distinct].sort((a, b) => a - b))
  })

  it('festival months (Oct/Nov) spend more on the spiking categories', () => {
    // Scoped to FESTIVAL_SPIKE_SUBCATS, the only spend `demoExpenses.amountFor`
    // actually multiplies (by 1.35 when `ctx.festival`).
    //
    // This used to compare WHOLE-MONTH totals, which made it depend on today's
    // date and fail on most anchors. The generator's one-off life events are
    // placed by WINDOW OFFSET, not calendar month -- the gadget splurge at
    // `m % 12 === 3` is 55k-95k, several times the entire festival boost. With a
    // window starting in August that offset lands on November and the assertion
    // passed for the wrong reason; starting in September it lands on December and
    // the property inverted. Measured across eight anchor dates, whole-month
    // festival averages swung between 77,329 and 117,808 while the underlying
    // 1.35 boost never changed.
    //
    // Per-category means, not sums: the window holds 4 Octobers/Novembers but a
    // varying number of other months, and festival months carry more rows.
    const spikeSubcats = new Set([
      'Clothing',
      'Gifts',
      'Groceries',
      'Dining Out',
      'Household Items',
      'Devices',
    ])

    let festivalTotal = 0
    let festivalCount = 0
    let otherTotal = 0
    let otherCount = 0
    for (const t of txs) {
      if (t.type !== 'Expense') continue
      if (!t.subcategory || !spikeSubcats.has(t.subcategory)) continue
      // Life-event splurges share the Devices subcategory but are not the
      // seasonal baseline, so the biggest ones are excluded by amount.
      if (t.amount > 50_000) continue
      const month = Number(monthKey(t.date).slice(5, 7))
      if (month === 10 || month === 11) {
        festivalTotal += t.amount
        festivalCount++
      } else {
        otherTotal += t.amount
        otherCount++
      }
    }

    expect(festivalCount).toBeGreaterThan(0)
    expect(otherCount).toBeGreaterThan(0)
    expect(festivalTotal / festivalCount).toBeGreaterThan(otherTotal / otherCount)
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
    expect(txs.filter((t) => t.subcategory === 'Consumer Durable EMI')).toHaveLength(12)
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

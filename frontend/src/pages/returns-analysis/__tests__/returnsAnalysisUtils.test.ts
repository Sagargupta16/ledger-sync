import { describe, expect, it } from 'vitest'

import * as utils from '../returnsAnalysisUtils'
import { computeInvestmentMetrics, countRealisedEvents, type TxLike } from '../returnsAnalysisUtils'

/**
 * Guards the removal of the fabricated CAGR / monthly-ROI pair.
 *
 * The statements this app ingests carry cost basis only -- no NAV, no unit price,
 * no market value anywhere -- so no rate of return is computable from them. The
 * old `calculateCAGR` was fed monthly TOTAL INCOME (salary) as begin/end and its
 * result was relabelled a portfolio CAGR, then converted to a monthly rate.
 */
describe('returnsAnalysisUtils -- no fabricated return metric', () => {
  it('exports no CAGR or ROI helper', () => {
    // Reverting the fix re-adds `calculateCAGR` and both assertions fail.
    expect('calculateCAGR' in utils).toBe(false)
    expect(Object.keys(utils).filter((name) => /cagr|roi/i.test(name))).toEqual([])
  })

  it('records the real-data inputs that made the old CAGR nonsense', () => {
    // Measured against the owner's ledger on the page's default FY window
    // (2026-04-01..2026-07-26): 4 monthly buckets, first month total income
    // 225,835.32, last (partial) month 9,911.11. The removed formula was
    // (end / begin) ^ (1 / years) - 1 with years = 4/12, then converted to a
    // monthly-equivalent rate. Both inputs were salary, not investments.
    const begin = 225835.32
    const end = 9911.11
    const years = 4 / 12
    const removedCagr = ((end / begin) ** (1 / years) - 1) * 100
    const removedMonthlyRoi = ((1 + removedCagr / 100) ** (1 / 12) - 1) * 100

    // What shipped: a portfolio that "lost everything" because a full salary
    // month was compared against a partial month.
    expect(removedCagr).toBeCloseTo(-99.9915, 3)
    expect(removedMonthlyRoi).toBeCloseTo(-54.2298, 3)
  })
})

describe('countRealisedEvents', () => {
  const txs: TxLike[] = [
    { type: 'Income', amount: 2255.18, category: 'Investment Income', note: 'Q3 FY26 MF STCG Profit' },
    { type: 'Expense', amount: 943.62, category: 'Investment Expenses', note: 'Q3 FY26 MF LTCG Loss' },
    { type: 'Income', amount: 500, category: 'Investment Income', note: 'Dividend credited' },
    { type: 'Expense', amount: 25, category: 'Stocks', note: 'Brokerage charge' },
    // Neither realised income nor cost: a salary credit and a grocery run.
    { type: 'Income', amount: 200000, category: 'Salary', note: 'Monthly salary' },
    { type: 'Expense', amount: 800, category: 'Food', note: 'Groceries' },
  ]

  it('counts only rows that booked investment income or cost', () => {
    expect(countRealisedEvents(txs)).toBe(4)
  })

  it('ignores a matching keyword outside an investment category', () => {
    // The investOnly gate: "loss" in a Food expense is not a realised event.
    expect(countRealisedEvents([{ type: 'Expense', amount: 10, category: 'Food', note: 'loss' }])).toBe(0)
  })

  it('ignores transfers, which are contributions and not realised outcomes', () => {
    const transfers: TxLike[] = [
      { type: 'Transfer', amount: 35000, category: 'Investments', note: 'Monthly SIP' },
    ]
    expect(countRealisedEvents(transfers)).toBe(0)
  })

  it('returns 0 for an empty window', () => {
    expect(countRealisedEvents([])).toBe(0)
  })

  it('counts the same rows the P&L headline sums', () => {
    const { netProfitLoss } = computeInvestmentMetrics(txs)
    // 2255.18 profit + 500 dividend - 943.62 loss - 25 brokerage.
    expect(netProfitLoss).toBeCloseTo(2255.18 + 500 - 943.62 - 25, 2)
    expect(countRealisedEvents(txs)).toBe(4)
  })
})

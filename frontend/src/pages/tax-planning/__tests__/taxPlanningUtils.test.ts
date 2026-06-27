import { describe, expect, it } from 'vitest'

import type { Transaction } from '@/types'
import { groupTransactionsByFY } from '../taxPlanningUtils'
import type { IncomeClassification } from '../types'

const classification: IncomeClassification = {
  taxable: ['Employment Income::Salary'],
  investmentReturns: [],
  nonTaxable: [],
  other: [],
}

function epfTx(amount: number): Transaction {
  return {
    id: `epf-${amount}`,
    date: '2025-06-15', // FY 2025-26
    amount,
    type: 'Income',
    category: 'Employment Income',
    subcategory: 'EPF Contribution',
    account: 'EPF',
    note: '',
  } as Transaction
}

/**
 * EPF inflow taxability is a user-owned setting (default exempt). The old code
 * hardcoded a 50% taxable fraction with no basis in EPF withdrawal rules; these
 * lock in the configurable behaviour.
 */
describe('groupTransactionsByFY EPF taxable fraction', () => {
  it('treats EPF inflows as fully exempt by default (fraction 0)', () => {
    const grouped = groupTransactionsByFY([epfTx(100_000)], 4, classification)
    const fy = grouped['FY 2025-26']
    expect(fy.taxableIncome).toBe(0)
    // the inflow is still recorded in the EPF group for display (at 0 taxable)
    expect(fy.incomeGroups.EPF.transactions).toHaveLength(1)
  })

  it('taxes the full inflow when fraction is 1 (100%)', () => {
    const grouped = groupTransactionsByFY([epfTx(100_000)], 4, classification, 1)
    expect(grouped['FY 2025-26'].taxableIncome).toBe(100_000)
  })

  it('taxes a partial fraction (e.g. 0.5 reproduces the old 50% behaviour)', () => {
    const grouped = groupTransactionsByFY([epfTx(100_000)], 4, classification, 0.5)
    expect(grouped['FY 2025-26'].taxableIncome).toBe(50_000)
  })
})

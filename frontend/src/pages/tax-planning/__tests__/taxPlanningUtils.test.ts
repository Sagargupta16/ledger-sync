import { describe, expect, it } from 'vitest'

import type { Transaction } from '@/types'
import {
  buildYearlyTaxData,
  computePaidTax,
  computePrevFYDisplay,
  computeTaxForFY,
  createEmptyFYData,
  groupTransactionsByFY,
} from '../taxPlanningUtils'
import type { PrevFYDisplayParams } from '../taxPlanningUtils'
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
  }
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

function salaryTx(amount: number): Transaction {
  return {
    id: `salary-${amount}`,
    date: '2025-06-30', // FY 2025-26
    amount,
    type: 'Income',
    category: 'Employment Income',
    subcategory: 'Salary',
    account: 'Bank: SBI',
    note: '',
  }
}

/**
 * `useTaxPlanning` and `useIncomeExpenseFlow` build the classification with
 * `preferences?.<field> ?? []` per field, straight off the API payload, and the
 * backend column default for all four is the JSON string `"[]"`. So an
 * unconfigured user reaches `groupTransactionsByFY` with four empty lists,
 * `classifyIncomeType` matches nothing, and the page reports zero taxable income
 * and zero tax on a real salary. The resolver runs inside
 * `groupTransactionsByFY` so both call sites are covered without editing them.
 */
describe('groupTransactionsByFY resolves an unconfigured classification', () => {
  it('taxes salary when all four lists arrive empty', () => {
    const grouped = groupTransactionsByFY([salaryTx(1_000_000)], 4, {
      taxable: [],
      investmentReturns: [],
      nonTaxable: [],
      other: [],
    })
    const fy = grouped['FY 2025-26']

    expect(fy.taxableIncome).toBe(1_000_000)
    expect(fy.incomeGroups['Salary & Stipend'].total).toBe(1_000_000)
    expect(fy.salaryMonths.has('2025-06')).toBe(true)
  })

  it('honours a deliberate empty taxable list when a sibling is populated', () => {
    const grouped = groupTransactionsByFY([salaryTx(1_000_000)], 4, {
      taxable: [],
      investmentReturns: [],
      nonTaxable: ['Employment Income::Salary'],
      other: [],
    })
    const fy = grouped['FY 2025-26']

    // The user filed Salary as non-taxable; re-injecting the taxable defaults
    // per field would tax it anyway.
    expect(fy.taxableIncome).toBe(0)
    expect(fy.incomeGroups['Salary & Stipend'].total).toBe(0)
    // The credit is still counted as income for the page's gross inflow.
    expect(fy.income).toBe(1_000_000)
  })
})

describe('computeTaxForFY salary TDS treatment toggle', () => {
  const recorded = 1_500_000

  it('net-of-TDS (default) backs out a gross ABOVE the recorded amount', () => {
    const r = computeTaxForFY('FY 2025-26', recorded, 12, null, 'new', true, {
      hasEmploymentIncome: true,
      recordedEmploymentIncome: recorded,
    })
    // recorded is treated as post-tax, so the implied gross is higher and the
    // tax (= TDS already deducted) is positive.
    expect(r.grossTaxableIncome).toBeGreaterThan(recorded)
    expect(r.taxAlreadyPaid).toBeGreaterThan(0)
  })

  it('gross mode taxes the recorded amount directly (no gross-up)', () => {
    const r = computeTaxForFY('FY 2025-26', recorded, 12, null, 'new', false)
    expect(r.grossTaxableIncome).toBe(recorded)
    // AY 2025-26 ITR-1 rules: old-regime salary deduction is Rs 50,000.
    // With no professional tax, Rs 10 lakh salary owes Rs 1,02,500 + 4% cess.
    const oldRegime = computeTaxForFY('FY 2024-25', 1_000_000, 0, 'old', 'new', false, {
      hasEmploymentIncome: true,
    })
    expect(oldRegime.standardDeduction).toBe(50_000)
    expect(oldRegime.totalTax).toBe(106_600)
    expect(oldRegime.estimatedTaxPaid).toBeNull()
    expect(oldRegime.taxAlreadyPaid).toBe(0)
  })

  it('net mode yields a higher tax than gross mode for the same recorded amount', () => {
    const net = computeTaxForFY('FY 2025-26', recorded, 12, null, 'new', true, {
      hasEmploymentIncome: true,
      recordedEmploymentIncome: recorded,
    })
    const gross = computeTaxForFY('FY 2025-26', recorded, 12, null, 'new', false)
    // Grossing up a net figure produces a larger taxable base -> more tax.
    expect(net.totalTax).toBeGreaterThan(gross.totalTax)
  })

  it('accepts a known period cash deduction in the employment options', () => {
    const result = computeTaxForFY(
      'FY 2026-27', 2_478_600, 12, null, 'new', true, {
        hasEmploymentIncome: true,
        recordedEmploymentIncome: 2_478_600,
        recordedEmploymentCashDeductions: 43_200,
      },
    )
    expect(Math.abs(result.grossTaxableIncome - 3_000_000)).toBeLessThan(2)
    expect(Math.abs(result.totalTax - 478_200)).toBeLessThan(1)
    expect(Math.abs(result.netAfterCashDeductions - 2_478_600)).toBeLessThan(1)
  })
})

describe('grouped employment eligibility', () => {
  const defaultClassification = { taxable: [], investmentReturns: [], nonTaxable: [], other: [] }

  it.each(['Bonuses', 'RSUs'])('carries eligibility for employment %s without regular salary', (subcategory) => {
    const tx = { ...salaryTx(1_500_000), subcategory }
    const fy = groupTransactionsByFY([tx], 4, defaultClassification)['FY 2025-26']

    expect(fy.hasEmploymentIncome).toBe(true)
    expect(fy.employmentTaxableIncome).toBe(1_500_000)
    expect(fy.salaryMonths.size).toBe(0)
    expect(fy.incomeGroups.Bonus.total).toBe(1_500_000)
    expect(computePaidTax('FY 2025-26', fy, null, 'new', true)).toBe(
      Math.round(computeTaxForFY('FY 2025-26', 1_500_000, 0, null, 'new', true, {
        hasEmploymentIncome: true,
        recordedEmploymentIncome: 1_500_000,
      }).totalTax),
    )
  })

  it('does not infer employment from classified gig/business income', () => {
    const tx = {
      ...salaryTx(1_500_000),
      category: 'Business/Self Employment Income',
      subcategory: 'Gig Work Income',
    }
    const fy = groupTransactionsByFY([tx], 4, defaultClassification)['FY 2025-26']
    const tax = computeTaxForFY('FY 2025-26', fy.taxableIncome, 0, null, 'new', false, {
      hasEmploymentIncome: fy.hasEmploymentIncome,
    })

    expect(fy.hasEmploymentIncome).toBe(false)
    expect(fy.employmentTaxableIncome).toBe(0)
    expect(fy.taxableIncome).toBe(1_500_000)
    expect(tax.standardDeduction).toBe(0)
    expect(tax.totalTax).toBe(109_200)
    expect(computePaidTax('FY 2025-26', fy, null, 'new', true)).toBe(0)
  })

  it('does not infer employment from a taxable EPF withdrawal', () => {
    const fy = groupTransactionsByFY([epfTx(1_500_000)], 4, classification, 1)['FY 2025-26']
    expect(fy.hasEmploymentIncome).toBe(false)
    expect(fy.taxableIncome).toBe(1_500_000)
  })

  it('respects an explicit non-taxable employment classification', () => {
    const fy = groupTransactionsByFY([salaryTx(1_500_000)], 4, {
      ...defaultClassification,
      nonTaxable: ['Employment Income::Salary'],
    })['FY 2025-26']
    expect(fy.hasEmploymentIncome).toBe(false)
    expect(fy.taxableIncome).toBe(0)
  })

  it('keeps the employment signal independent for each fiscal year', () => {
    const transactions = [
      salaryTx(100_000),
      {
        ...salaryTx(200_000),
        date: '2026-06-30',
        category: 'Business/Self Employment Income',
        subcategory: 'Gig Work Income',
      },
    ]
    const grouped = groupTransactionsByFY(transactions, 4, defaultClassification)
    expect(grouped['FY 2025-26'].hasEmploymentIncome).toBe(true)
    expect(grouped['FY 2026-27'].hasEmploymentIncome).toBe(false)
  })

  it('does not report paid TDS for gross ledger inputs', () => {
    const fy = groupTransactionsByFY([salaryTx(3_000_000)], 4, defaultClassification)['FY 2025-26']
    expect(computePaidTax('FY 2025-26', fy, null, 'new', false)).toBe(0)
    expect(computePaidTax('FY 2025-26', fy, null, 'new', true)).toBeGreaterThan(0)
  })

  it('separates salary from gig receipts before estimating paid tax', () => {
    const tx = {
      ...salaryTx(500_000),
      category: 'Business/Self Employment Income',
      subcategory: 'Gig Work Income',
    }
    const fy = groupTransactionsByFY([salaryTx(1_000_000), tx], 4, defaultClassification)['FY 2025-26']
    expect(fy.taxableIncome).toBe(1_500_000)
    expect(fy.employmentTaxableIncome).toBe(1_000_000)
    expect(fy.hasEmploymentIncome).toBe(true)
    expect(computePaidTax('FY 2025-26', fy, null, 'new', true)).toBe(200)
  })

  it('does not retain employment eligibility after a complete salary reversal', () => {
    const fy = groupTransactionsByFY([
      salaryTx(100_000),
      salaryTx(-100_000),
      {
        ...salaryTx(1_500_000),
        category: 'Business/Self Employment Income',
        subcategory: 'Gig Work Income',
      },
    ], 4, defaultClassification)['FY 2025-26']
    expect(fy.employmentTaxableIncome).toBe(0)
    expect(fy.hasEmploymentIncome).toBe(false)
    expect(computePaidTax('FY 2025-26', fy, null, 'new', true)).toBe(0)
  })
})

describe('previous FY gross and net display', () => {
  it('shows after-tax net and liability for a completed FY of gross receipts', () => {
    const fyData = createEmptyFYData()
    fyData.taxableIncome = 3_000_000
    fyData.employmentTaxableIncome = 3_000_000
    fyData.hasEmploymentIncome = true
    fyData.salaryMonths = new Set(Array.from({ length: 12 }, (_, index) => String(index)))
    const params: PrevFYDisplayParams = {
      effectiveFY: 'FY 2026-27',
      currentFYLabel: 'FY 2026-27',
      transactionsByFY: { 'FY 2025-26': fyData },
      regimeOverride: null,
      preferredRegime: 'new',
      hasSalaryData: false,
      salaryStructure: {},
      rsuGrants: [],
      growthAssumptions: {
        base_salary_growth_pct: 0,
        bonus_growth_pct: 0,
        epf_scales_with_base: false,
        nps_growth_pct: 0,
        stock_price_appreciation_pct: 0,
        projection_years: 1,
      },
      fiscalYearStartMonth: 4,
      isNewRegime: true,
      salaryIsNetOfTds: false,
    }
    expect(computePrevFYDisplay(params)).toEqual({
      net: 2_521_800,
      gross: 3_000_000,
      totalTax: 478_200,
    })
  })
})

describe('annual recorded-income tax liability', () => {
  it('retains gross salary and business liability while paid-tax estimates remain zero', () => {
    const salary = createEmptyFYData()
    salary.taxableIncome = 3_000_000
    salary.employmentTaxableIncome = 3_000_000
    salary.hasEmploymentIncome = true
    salary.salaryMonths = new Set(Array.from({ length: 12 }, (_, index) => String(index)))
    const business = createEmptyFYData()
    business.taxableIncome = 1_500_000
    const data = buildYearlyTaxData(
      ['FY 2026-27', 'FY 2025-26'],
      { 'FY 2025-26': salary, 'FY 2026-27': business },
      [{ fy: '2026-27', grossTaxable: 3_000_000, cashDeductions: 0 }],
      'FY 2026-27',
      null,
      'new',
      false,
    )

    expect(data).toEqual([
      { fy: 'FY 2025-26', paidTax: 478_200, projected: 0, cumulative: 478_200 },
      { fy: 'FY 2026-27', paidTax: 109_200, projected: 837_000, cumulative: 1_424_400 },
    ])
    expect(computePaidTax('FY 2025-26', salary, null, 'new', false)).toBe(0)
    expect(computePaidTax('FY 2026-27', business, null, 'new', true)).toBe(0)
  })
})

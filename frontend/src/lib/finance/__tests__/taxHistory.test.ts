import { describe, expect, it } from 'vitest'

import type { Transaction } from '@/types'
import { DEFAULT_GROWTH_ASSUMPTIONS, DEFAULT_SALARY_COMPONENTS } from '@/types/salary'

import {
  buildYearlyTaxData,
  computePaidTax,
  computePrevFYDisplay,
  createEmptyFYData,
  groupTransactionsByFY,
  reconcileTaxWithholding,
} from '../taxHistory'

const classification = { taxable: [], investmentReturns: [], nonTaxable: [], other: [] }

function salaryReceipt(date: string, amount = 206_550): Transaction {
  return {
    id: `salary-${date}-${amount}`,
    date,
    amount,
    type: 'Income',
    category: 'Employment Income',
    subcategory: 'Salary',
    account: 'Bank',
  }
}

function businessData(income: number) {
  return { ...createEmptyFYData(), income, taxableIncome: income }
}

const fullYearReceipts = Array.from({ length: 12 }, (_, index) => {
  const calendarMonth = index + 4
  const year = calendarMonth > 12 ? 2027 : 2026
  const month = calendarMonth > 12 ? calendarMonth - 12 : calendarMonth
  return salaryReceipt(`${year}-${String(month).padStart(2, '0')}-28`)
})

describe('recorded withholding reconciliation', () => {
  it.each([
    [100, 150, 0, 150],
    [150, 150, 0, 150],
    [200, 150, 50, 200],
  ])('reconciles computed %i against recorded %i', (computed, recorded, tdsAtSource, taxTotal) => {
    expect(reconcileTaxWithholding(computed, recorded)).toEqual({ tdsAtSource, taxTotal })
  })
})

describe('known recorded employment deductions by FY', () => {
  it('restores exactly twelve configured EPF deductions for twelve post-EPF salary receipts', () => {
    const grouped = groupTransactionsByFY(
      fullYearReceipts, 4, classification, 0, { '2026-27': { epf_monthly: 3_600 } },
    )
    const fy = grouped['FY 2026-27']

    expect(fy.taxableIncome).toBe(2_478_600)
    expect(fy.recordedEmploymentCashDeductions).toBe(43_200)
    expect(computePaidTax('FY 2026-27', fy, null, 'new', true)).toBe(478_200)
    expect(buildYearlyTaxData(
      ['FY 2026-27'], grouped, [], 'FY 2026-27', null, 'new', true,
    )).toEqual([
      { fy: 'FY 2026-27', paidTax: 478_200, projected: 0, cumulative: 478_200 },
    ])
  })

  it('counts split salary receipts once per month and excludes bonus-only months', () => {
    const grouped = groupTransactionsByFY([
      salaryReceipt('2026-04-10', 100_000),
      salaryReceipt('2026-04-28', 106_550),
      salaryReceipt('2026-06-28'),
      { ...salaryReceipt('2026-07-28', 50_000), subcategory: 'Bonuses' },
      { ...salaryReceipt('2026-08-28', 172_000), subcategory: 'RSUs' },
    ], 4, classification, 0, { 'FY2026-27': { epf_monthly: 3_600 } })

    expect(grouped['FY 2026-27'].salaryMonths).toEqual(new Set(['2026-04', '2026-06']))
    expect(grouped['FY 2026-27'].recordedEmploymentCashDeductions).toBe(7_200)
  })

  it('does not extrapolate EPF across unknown years or overwrite an explicit zero', () => {
    const grouped = groupTransactionsByFY([
      salaryReceipt('2025-04-28'),
      salaryReceipt('2026-04-28'),
      salaryReceipt('2027-04-28'),
    ], 4, classification, 0, {
      '2026-27': { epf_monthly: 3_600 },
      '2027-28': { epf_monthly: 0 },
    })

    expect(grouped['FY 2025-26'].recordedEmploymentCashDeductions).toBe(0)
    expect(grouped['FY 2026-27'].recordedEmploymentCashDeductions).toBe(3_600)
    expect(grouped['FY 2027-28'].recordedEmploymentCashDeductions).toBe(0)
  })

  it('does not treat a business category named Salary as a payroll month', () => {
    const grouped = groupTransactionsByFY([{
      ...salaryReceipt('2026-04-28'),
      category: 'Business/Self Employment Income',
    }], 4, {
      ...classification, taxable: ['Business/Self Employment Income::Salary'],
    }, 0, { '2026-27': { epf_monthly: 3_600 } })

    expect(grouped['FY 2026-27'].taxableIncome).toBe(206_550)
    expect(grouped['FY 2026-27'].salaryMonths.size).toBe(0)
    expect(grouped['FY 2026-27'].recordedEmploymentCashDeductions).toBe(0)
  })

  it('preserves period EPF in completed-FY cash-net comparisons', () => {
    const grouped = groupTransactionsByFY(
      fullYearReceipts, 4, classification, 0, { '2026-27': { epf_monthly: 3_600 } },
    )
    const previous = computePrevFYDisplay({
      effectiveFY: 'FY 2027-28',
      currentFYLabel: 'FY 2027-28',
      transactionsByFY: grouped,
      regimeOverride: null,
      preferredRegime: 'new',
      hasSalaryData: true,
      salaryStructure: { '2026-27': { ...DEFAULT_SALARY_COMPONENTS, base_salary_annual: 3_000_000 } },
      rsuGrants: [],
      growthAssumptions: DEFAULT_GROWTH_ASSUMPTIONS,
      fiscalYearStartMonth: 4,
      isNewRegime: true,
      salaryIsNetOfTds: true,
    })

    expect(Math.abs((previous?.gross ?? 0) - 3_000_000)).toBeLessThan(2)
    expect(Math.abs((previous?.net ?? 0) - 2_478_600)).toBeLessThan(1)
    expect(Math.abs((previous?.totalTax ?? 0) - 478_200)).toBeLessThan(1)
  })
})

describe('annual income scope', () => {
  it.each(['2026-27', 'FY2026-27', 'fy 2026-27'])('combines business and projected employment for %s', (fy) => {
    const rows = buildYearlyTaxData(
      ['FY 2026-27'],
      { 'FY 2026-27': businessData(1_500_000) },
      [{ fy, grossTaxable: 3_000_000, cashDeductions: 43_200 }],
      'FY 2026-27',
      null,
      'new',
      true,
    )
    expect(rows).toEqual([
      { fy: 'FY 2026-27', paidTax: 109_200, projected: 837_000, cumulative: 946_200 },
    ])
  })

  it('does not add already recorded salary to the full annual employment projection', () => {
    const recorded = {
      ...businessData(2_500_000),
      employmentTaxableIncome: 1_000_000,
      hasEmploymentIncome: true,
      salaryMonths: new Set(['2026-04', '2026-05', '2026-06', '2026-07']),
    }
    const rows = buildYearlyTaxData(
      ['FY 2026-27'],
      { 'FY 2026-27': recorded },
      [{ fy: '2026-27', grossTaxable: 3_000_000, cashDeductions: 43_200 }],
      'FY 2026-27',
      null,
      'new',
      false,
    )
    expect(rows).toEqual([
      { fy: 'FY 2026-27', paidTax: 320_600, projected: 625_600, cumulative: 946_200 },
    ])
  })

  it('keeps completed records and each future FY separate, even when future transactions exist', () => {
    const rows = buildYearlyTaxData(
      ['FY 2028-29', 'FY 2027-28', 'FY 2026-27', 'FY 2025-26'],
      {
        'FY 2025-26': businessData(1_500_000),
        'FY 2026-27': businessData(1_500_000),
        'FY 2027-28': businessData(500_000),
      },
      ['2025-26', '2026-27', '2027-28', '2028-29'].map((fy) => ({
        fy, grossTaxable: 3_000_000, cashDeductions: 0,
      })),
      'FY 2026-27',
      null,
      'new',
      false,
    )
    expect(rows.map(({ paidTax, projected }) => paidTax + projected)).toEqual([
      109_200, 946_200, 634_200, 478_200,
    ])
    expect(rows[0].projected).toBe(0)
    expect(rows[1].projected).toBe(837_000)
    expect(rows[2].projected).toBe(634_200)
  })

  it('uses the selected regime for combined liability and historical availability for every FY', () => {
    const old = buildYearlyTaxData(
      ['FY 2026-27'],
      { 'FY 2026-27': businessData(1_500_000) },
      [{ fy: '2026-27', grossTaxable: 3_000_000, cashDeductions: 0 }],
      'FY 2026-27',
      'old',
      'new',
      false,
    )
    expect(old[0].paidTax).toBe(273_000)
    expect(old[0].paidTax + old[0].projected).toBe(1_195_800)

    const historical = buildYearlyTaxData(
      ['FY 2019-20'], {}, [{ fy: '2019-20', grossTaxable: 3_000_000, cashDeductions: 0 }],
      'FY 2026-27', 'new', 'new', false,
    )
    expect(historical[0].projected).toBe(727_800)
  })

  it.each([
    ['new', 946_200, 2_478_600],
    ['old', 1_195_800, 2_229_000],
  ] as const)('uses the same combined %s-regime scope for a preceding FY still being projected', (
    regimeOverride, expectedTax, expectedPayrollCash,
  ) => {
    const previous = computePrevFYDisplay({
      effectiveFY: 'FY 2027-28',
      currentFYLabel: 'FY 2026-27',
      transactionsByFY: { 'FY 2026-27': businessData(1_500_000) },
      regimeOverride,
      preferredRegime: 'new',
      hasSalaryData: true,
      salaryStructure: { '2026-27': { ...DEFAULT_SALARY_COMPONENTS, base_salary_annual: 3_000_000 } },
      rsuGrants: [],
      growthAssumptions: DEFAULT_GROWTH_ASSUMPTIONS,
      fiscalYearStartMonth: 4,
      isNewRegime: regimeOverride === 'new',
      salaryIsNetOfTds: true,
    })

    expect(previous?.gross).toBe(4_500_000)
    expect(previous?.totalTax).toBe(expectedTax)
    expect(previous?.net).toBeCloseTo(expectedPayrollCash, 5)
  })
})

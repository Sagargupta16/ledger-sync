import { describe, expect, it } from 'vitest'
import { projectFiscalYear } from '@/lib/projectionCalculator'
import { DEFAULT_GROWTH_ASSUMPTIONS, DEFAULT_SALARY_COMPONENTS, type RsuGrant } from '@/types/salary'
import { computeTaxPlanning, type FYData } from '../taxPlanning'
import {
  applyProjectionTaxRegime,
  buildPayrollPlanning,
  summarizePayrollSchedule,
  taxPlanningDisplay,
} from '../payrollPlanning'

const salary = { ...DEFAULT_SALARY_COMPONENTS, base_salary_annual: 3_000_000 }
const grossTax = computeTaxPlanning({
  selectedFY: 'FY 2026-27',
  recordedTaxableIncome: 3_000_000,
  recordedEmploymentIncome: 3_000_000,
  salaryMonthsCount: 12,
  hasEmploymentIncome: true,
  incomeBasis: 'gross',
})

function recordedSalary(employmentIncome: number): FYData {
  return {
    income: employmentIncome,
    expense: 0,
    taxableIncome: employmentIncome,
    employmentTaxableIncome: employmentIncome,
    hasEmploymentIncome: true,
    salaryMonths: new Set(['2025-04', '2025-06']),
    transactions: [],
    incomeGroups: {},
  }
}

describe('shared tax and payroll presentation', () => {
  it.each([
    { regime: 'new' as const, tax: 556_200, cash: 2_561_650, credit: 82_150 },
    { regime: 'old' as const, tax: 805_800, cash: 2_332_850, credit: 61_350 },
  ])('retains March share credit without refunding earlier cash TDS in the $regime regime', (expected) => {
    const grants: RsuGrant[] = [{
      id: 'late-vest', stock_name: 'TEST', stock_price: 10_000, grant_date: null, notes: null,
      vestings: [{ date: '2026-03-15', quantity: 25, net_quantity: 5, price_at_vest: 10_000 }],
    }]
    const base = projectFiscalYear('2025-26', {
      '2025-26': { ...salary, epf_monthly: 0 },
    }, grants, DEFAULT_GROWTH_ASSUMPTIONS, 4)
    const annual = applyProjectionTaxRegime(base, expected.regime).projection
    const tax = computeTaxPlanning({
      selectedFY: 'FY 2025-26', recordedTaxableIncome: 3_250_000,
      recordedEmploymentIncome: 3_250_000, salaryMonthsCount: 12,
      hasEmploymentIncome: true, incomeBasis: 'gross', preferredRegime: expected.regime,
    })
    const { schedule } = buildPayrollPlanning({
      projection: annual, tax, fyData: null, fyStartMonth: 4,
      isCurrentFY: false, useSalaryProjection: true,
    })
    const summary = summarizePayrollSchedule(schedule)

    expect(annual.totalTax).toBe(expected.tax)
    expect(annual.cashTakeHome).toBeCloseTo(expected.cash, 5)
    expect(annual.excessShareWithholding).toBeCloseTo(expected.credit, 5)
    expect(annual.netCompensation).toBeCloseTo(expected.cash + 50_000, 5)
    expect(summary.cashTakeHome).toBeCloseTo(annual.cashTakeHome, 5)
    expect(summary.cashTds + summary.shareWithholding - annual.excessShareWithholding)
      .toBeCloseTo(annual.totalTax, 5)
    if (expected.regime === 'new') expect(base.cashTakeHome).toBe(2_561_650)
  })

  it.each([undefined, 0, 5, 17.2])('settles April withholding once for received quantity %s', (netQuantity) => {
    const grants: RsuGrant[] = [{
      id: 'early-vest', stock_name: 'TEST', stock_price: 10_000, grant_date: null, notes: null,
      vestings: [{ date: '2025-04-15', quantity: 25, net_quantity: netQuantity, price_at_vest: 10_000 }],
    }]
    const annual = projectFiscalYear('2025-26', {
      '2025-26': { ...salary, epf_monthly: 0 },
    }, grants, DEFAULT_GROWTH_ASSUMPTIONS, 4)

    expect(annual.totalTax).toBe(556_200)
    expect(annual.excessShareWithholding).toBe(0)
    expect(annual.cashTakeHome).toBeCloseTo(3_000_000 - 556_200 + annual.rsuWithholding, 5)
    expect(annual.netCompensation).toBeCloseTo(3_250_000 - 556_200, 5)
  })

  it('never grosses up gross records or claims withholding when the schedule is enabled', () => {
    const projection = projectFiscalYear('2026-27', { '2026-27': salary }, [], DEFAULT_GROWTH_ASSUMPTIONS, 4)
    const plan = buildPayrollPlanning({
      projection,
      tax: grossTax,
      fyData: { ...recordedSalary(3_000_000), salaryMonths: new Set(['2026-04']) },
      fyStartMonth: 4,
      isCurrentFY: true,
      useSalaryProjection: false,
    })
    const display = taxPlanningDisplay(grossTax, null, 3_000_000)

    expect(display.gross).toBe(3_000_000)
    expect(display.totalTax).toBe(478_200)
    expect(applyProjectionTaxRegime(projection, 'new').projection.totalTax).toBe(478_200)
    expect(plan.paidEstimate).toBeNull()
    expect(summarizePayrollSchedule(plan.schedule).totalTax).toBeCloseTo(display.totalTax, 5)
  })

  it('keeps cash payroll, retained shares, and the selected regime consistent', () => {
    const grants: RsuGrant[] = [{
      id: 'synthetic', stock_name: 'TEST', stock_price: 10_000, grant_date: null, notes: null,
      vestings: [{ date: '2026-04-10', quantity: 25, net_quantity: 17.2, price_at_vest: 10_000 }],
    }]
    const projection = projectFiscalYear('2026-27', { '2026-27': salary }, grants, DEFAULT_GROWTH_ASSUMPTIONS, 4)
    const oldRegime = applyProjectionTaxRegime(projection, 'old')
    const display = taxPlanningDisplay(grossTax, oldRegime, 0)

    expect(display.net).toBe(oldRegime.projection.cashTakeHome)
    expect(display.totalTax).toBe(oldRegime.taxResult.totalTax)
    expect(display.totalTax).toBe(805_800)
    expect(oldRegime.projection.netCompensation).toBeCloseTo(
      oldRegime.projection.cashTakeHome + 172_000, 5,
    )
    expect(oldRegime.projection.cashTakeHome).toBeCloseTo(
      3_000_000 - salary.epf_monthly * 12 - oldRegime.projection.payrollTax, 5,
    )
  })

  it('matches recorded RSU receipts once and keeps gaps in recorded salary months', () => {
    const grants: RsuGrant[] = [{
      id: 'synthetic', stock_name: 'TEST', stock_price: 10_000, grant_date: null, notes: null,
      vestings: [{ date: '2025-04-10', quantity: 25, net_quantity: 17, price_at_vest: 10_000 }],
    }]
    const projection = projectFiscalYear('2025-26', { '2025-26': salary }, grants, DEFAULT_GROWTH_ASSUMPTIONS, 4)
    const cashOnly = recordedSalary(400_000)
    const includingShares: FYData = {
      ...recordedSalary(570_000),
      incomeGroups: { Bonus: { total: 170_000, transactions: [{
        id: 'net-rsu-receipt', date: '2025-04-12', amount: 170_000, type: 'Income',
        account: 'Broker', category: 'Employment Income', subcategory: 'RSUs',
      }] } },
    }
    const tax = computeTaxPlanning({
      selectedFY: 'FY 2025-26',
      recordedTaxableIncome: 570_000,
      recordedEmploymentIncome: 570_000,
      salaryMonthsCount: 2,
      hasEmploymentIncome: true,
      incomeBasis: 'net',
    })
    const inputs = { projection, tax, fyStartMonth: 4, isCurrentFY: true, useSalaryProjection: false }
    const withoutReceipt = buildPayrollPlanning({ ...inputs, fyData: cashOnly })
    const withReceipt = buildPayrollPlanning({ ...inputs, fyData: includingShares })

    expect(withReceipt.paidMonthIndices).toEqual([0, 2])
    expect(withReceipt.paidEstimate?.rsuWithholding).toBe(80_000)
    expect(withReceipt.paidEstimate?.taxPaid).toBeCloseTo(withoutReceipt.paidEstimate!.taxPaid, 5)
    expect(withReceipt.schedule).toEqual(withoutReceipt.schedule)

    const delayedReceipt = {
      ...includingShares,
      incomeGroups: { Bonus: {
        total: 170_000,
        transactions: [{ ...includingShares.incomeGroups.Bonus.transactions[0], date: '2025-05-01' }],
      } },
    }
    const withDelayedReceipt = buildPayrollPlanning({ ...inputs, fyData: delayedReceipt })
    expect(withDelayedReceipt.paidEstimate).toEqual(withReceipt.paidEstimate)
    expect(withDelayedReceipt.schedule).toEqual(withReceipt.schedule)
  })
})

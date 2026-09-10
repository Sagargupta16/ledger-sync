import { describe, expect, it } from 'vitest'

import { projectAnnualBonus, projectFiscalYear } from '@/lib/projectionCalculator'
import { convertedRsuPrice, valueRsuVestings } from '@/lib/rsuVesting'
import { salaryCashEarnings } from '@/lib/salaryCompensation'
import { buildTdsSchedule, computeTaxPaidTillDate } from '@/lib/tdsScheduleCalculator'
import { calculateTax, getStandardDeduction, getTaxSlabs } from '@/lib/taxCalculator'
import { DEFAULT_GROWTH_ASSUMPTIONS, DEFAULT_SALARY_COMPONENTS, type RsuGrant } from '@/types/salary'

const fy = 2026
const slabs = getTaxSlabs(fy, 'new')
const standardDeduction = getStandardDeduction(fy)
const annualTax = (income: number) =>
  calculateTax(income, slabs, standardDeduction, true, 12, true, fy).totalTax
const salary = { ...DEFAULT_SALARY_COMPONENTS, base_salary_annual: 3_000_000, epf_monthly: 0 }
const grant: RsuGrant = {
  id: 'synthetic-salary',
  stock_name: 'TEST',
  stock_price: 1000,
  grant_date: null,
  notes: null,
  vestings: [{ date: '2026-08-15', quantity: 25, price_at_vest: 1000, net_quantity: 17.2 }],
}

describe('tax-paid inference across thresholds', () => {
  it.each([
    [1_200_000, 300_000],
    [3_000_000, 300_000],
    [4_000_000, 1_500_000],
  ])('round-trips base %s plus bonus %s through the actual tax engine', (base, bonus) => {
    const expectedTax = annualTax(base + bonus)
    const result = computeTaxPaidTillDate({
      baseAnnual: base,
      monthsPaid: 12,
      receivedNet: base + bonus - expectedTax,
      slabs, standardDeduction, isNewRegime: true, fyStartYear: fy,
    })
    // The existing inverse stops within one rupee of the forward net result.
    expect(Math.abs(result.taxPaid - expectedTax)).toBeLessThan(2)
    expect(Math.abs(result.cashBonusGross - bonus)).toBeLessThan(2)
  })

  it('counts known RSU withholding once with either cash-only or matched ledger receipts', () => {
    const events = valueRsuVestings([grant], { fyStartMonth: 4, today: '2026-09-10' })
    const cashReceived = (3_000_000 - annualTax(3_000_000)) / 12 * 5
    const params = {
      baseAnnual: 3_000_000, monthsPaid: 5, receivedNet: cashReceived,
      rsuVestingEvents: events, slabs, standardDeduction, isNewRegime: true, fyStartYear: fy,
    }
    const cashOnly = computeTaxPaidTillDate(params)
    const withLedgerRsu = computeTaxPaidTillDate({
      ...params,
      receivedNet: cashReceived + 17_200,
      rsuNetIncludedInReceivedNet: 17_200,
    })

    expect(cashOnly.rsuRecordedWithholding).toBeCloseTo(7800, 2)
    expect(cashOnly.rsuEstimatedWithholding).toBe(0)
    expect(Math.abs(cashOnly.cashTaxPaid - 199_250)).toBeLessThan(2)
    expect(Math.abs(cashOnly.taxPaid - 207_050)).toBeLessThan(2)
    expect(cashOnly.rsuGrossIncome).toBe(25_000)
    expect(withLedgerRsu).toEqual(cashOnly)
  })
})

describe('cash and RSU compensation', () => {
  it('separates retained shares from bank cash in annual and monthly projections', () => {
    const annual = projectFiscalYear('2026-27', { '2026-27': salary }, [grant], DEFAULT_GROWTH_ASSUMPTIONS, 4)
    const rows = buildTdsSchedule({
      regularMonthlyIncome: 250_000, extraByMonth: {},
      rsuVestingEvents: annual.rsuVestingEvents,
      fyStartMonth: 4, fyStartYear: fy, slabs, standardDeduction, isNewRegime: true,
    })
    expect(annual.cashTakeHome).toBe(2_521_800)
    expect(annual.netShareValue).toBe(17_200)
    expect(annual.netCompensation).toBe(2_539_000)
    expect(rows[4].cashTakeHome).toBe(210_150)
    expect(rows[4].netShareValue).toBe(17_200)
    expect(rows[4].netCompensation).toBe(227_350)
    expect(rows[4].cashTds).toBe(39_850)
    expect(rows[4].rsuRecordedWithholding).toBe(7800)
    expect(rows[11].cumulativeTds).toBe(annual.totalTax)
    expect(rows.reduce((total, row) => total + row.cashTakeHome, 0)).toBe(annual.cashTakeHome)
  })

  it('uses the same appreciated future vest in annual and monthly tax', () => {
    const future = { ...grant, vestings: [{ date: '2027-08-15', quantity: 100 }] }
    const annual = projectFiscalYear('2027-28', { '2026-27': salary }, [future], {
      ...DEFAULT_GROWTH_ASSUMPTIONS, stock_price_appreciation_pct: 10,
    }, 4)
    const rows = buildTdsSchedule({
      regularMonthlyIncome: 250_000, extraByMonth: {},
      rsuVestingEvents: annual.rsuVestingEvents,
      fyStartMonth: 4, fyStartYear: 2027, slabs, standardDeduction, isNewRegime: true,
    })
    expect(annual.rsuIncome).toBeCloseTo(110_000, 2)
    expect(rows[4].rsuGrossIncome).toBe(annual.rsuIncome)
    expect(rows[11].cumulativeTds).toBeCloseTo(512_520, 2)
    expect(rows[11].cumulativeTds).toBe(annual.totalTax)
    expect(rows[4].rsuEstimatedWithholding).toBeGreaterThan(0)
    expect(rows[4].rsuRecordedWithholding).toBe(0)
  })

  it('deducts employee EPF from cash but not new-regime taxable earnings', () => {
    const withEpf = { ...salary, epf_monthly: 3600 }
    const annual = projectFiscalYear('2026-27', { '2026-27': withEpf }, [], DEFAULT_GROWTH_ASSUMPTIONS, 4)
    const rows = buildTdsSchedule({
      regularMonthlyIncome: 250_000, extraByMonth: {}, monthlyCashDeductions: 3600,
      fyStartMonth: 4, fyStartYear: fy, slabs, standardDeduction, isNewRegime: true,
    })
    expect(annual.grossTaxable).toBe(3_000_000)
    expect(annual.totalTax).toBe(478_200)
    expect(annual.cashDeductions).toBe(43_200)
    expect(annual.cashTakeHome).toBe(2_478_600)
    expect(rows[0].cashTakeHome).toBe(206_550)
    expect(rows[11].cumulativeTds).toBe(annual.totalTax)
    expect(salaryCashEarnings(withEpf)).toEqual({ annual: 3_000_000, monthly: 250_000 })
  })

  it('carries excess share withholding without pretending it was refunded as cash', () => {
    const fullyWithheld = { ...grant, vestings: [{ date: '2026-04-15', quantity: 10, net_quantity: 0, price_at_vest: 1000 }] }
    const rows = buildTdsSchedule({
      regularMonthlyIncome: 1_000_000 / 12, extraByMonth: {},
      rsuVestingEvents: valueRsuVestings([fullyWithheld], { fyStartMonth: 4 }),
      fyStartMonth: 4, fyStartYear: fy, slabs, standardDeduction, isNewRegime: true,
    })
    expect(rows[0].cashTds).toBe(0)
    expect(rows[0].netShareValue).toBe(0)
    expect(rows[0].cashTakeHome).toBe(1_000_000 / 12)
    expect(rows[11].cumulativeCashTds).toBe(0)
    expect(rows[11].excessShareWithholding).toBe(7600)
  })
})

describe('explicit bonus recurrence', () => {
  it('preserves zero-growth one-time and nonzero-growth recurring saved behavior', () => {
    expect(projectAnnualBonus(300_000, 1, { bonus_growth_pct: 0 })).toBe(0)
    expect(projectAnnualBonus(300_000, 1, { bonus_growth_pct: 10 })).toBe(330_000)
    expect(projectAnnualBonus(300_000, 1, { bonus_growth_pct: 0, bonus_mode: null })).toBe(0)
  })

  it('repeats a flat bonus only with explicit recurring mode', () => {
    expect(projectAnnualBonus(300_000, 2, { bonus_growth_pct: 0, bonus_mode: 'recurring' })).toBe(300_000)
    expect(projectAnnualBonus(300_000, 2, { bonus_growth_pct: 10, bonus_mode: 'one_time' })).toBe(0)
    const annual = projectFiscalYear('2027-28', {
      '2026-27': { ...salary, bonus_annual: 300_000 },
    }, [], { ...DEFAULT_GROWTH_ASSUMPTIONS, bonus_mode: 'recurring' }, 4)
    expect(annual.bonus).toBe(300_000)
  })
})

describe('RSU conversion safety', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects unusable exchange rate %s', (rate) => {
    expect(convertedRsuPrice(200, rate)).toBeNull()
  })

  it('converts only a usable quote and exchange rate', () => {
    expect(convertedRsuPrice(200, 80)).toBe(16_000)
    expect(convertedRsuPrice(0, 80)).toBeNull()
  })
})

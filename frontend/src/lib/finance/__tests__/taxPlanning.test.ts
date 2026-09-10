import { describe, expect, it } from 'vitest'

import { calculateTax, getStandardDeduction, getTaxSlabs } from '@/lib/taxCalculator'

import {
  calculateBreakEvenDeduction,
  compareTaxRegimes,
  computeAnnualTaxPlanning,
  computeTaxForFY,
  computeTaxPlanning,
  resolveSelectedRegime,
} from '../taxPlanning'
import type { TaxPlanningInput, TaxRegime } from '../taxPlanning'

const salaryInput: TaxPlanningInput = {
  selectedFY: 'FY 2026-27',
  recordedTaxableIncome: 3_000_000,
  recordedEmploymentIncome: 3_000_000,
  salaryMonthsCount: 12,
  hasEmploymentIncome: true,
  incomeBasis: 'gross',
}

describe('tax input basis and employment eligibility', () => {
  it('keeps gross salary unchanged and reports liability without inferring paid TDS', () => {
    const result = computeTaxPlanning(salaryInput)

    expect(result.grossTaxableIncome).toBe(3_000_000)
    expect(result.totalTax).toBe(478_200)
    expect(result.netAfterTax).toBe(2_521_800)
    expect(result.estimatedTaxPaid).toBeNull()
    expect(result.taxAlreadyPaid).toBe(0)
    expect(result.incomeBasis).toBe('gross')
  })

  it('grosses up net receipts and keeps the forward tax result consistent', () => {
    const result = computeTaxPlanning({ ...salaryInput, incomeBasis: 'net' })

    expect(Math.abs(result.grossTaxableIncome - 3_695_058.14)).toBeLessThan(2)
    expect(Math.abs(result.netAfterTax - salaryInput.recordedTaxableIncome)).toBeLessThan(1)
    expect(result.estimatedTaxPaid).toBe(result.totalTax)
    expect(result.taxAlreadyPaid).toBe(result.totalTax)
  })

  it('does not grant salary deductions or professional tax to gross gig income', () => {
    const result = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: 1_500_000,
      hasEmploymentIncome: false,
    })

    expect(result.standardDeduction).toBe(0)
    expect(result.professionalTax).toBe(0)
    expect(result.totalTax).toBe(109_200)
  })

  it('grants the employment deduction to a bonus-only year with no salary months', () => {
    const result = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: 1_500_000,
      recordedEmploymentIncome: 1_500_000,
      salaryMonthsCount: 0,
    })

    expect(result.standardDeduction).toBe(75_000)
    expect(result.professionalTax).toBe(0)
    expect(result.totalTax).toBe(97_500)
  })

  it('ignores the salary net-of-TDS preference for a gig-only FY', () => {
    const result = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: 1_500_000,
      recordedEmploymentIncome: 0,
      salaryMonthsCount: 0,
      hasEmploymentIncome: false,
      incomeBasis: 'net',
    })

    expect(result.grossTaxableIncome).toBe(1_500_000)
    expect(result.standardDeduction).toBe(0)
    expect(result.professionalTax).toBe(0)
    expect(result.totalTax).toBe(109_200)
    expect(result.netAfterTax).toBe(1_390_800)
    expect(result.requestedIncomeBasis).toBe('net')
    expect(result.incomeBasis).toBe('gross')
    expect(result.estimatedTaxPaid).toBeNull()
    expect(result.taxAlreadyPaid).toBe(0)
  })

  it.each(['gross', 'net'] as const)('has no tax on empty %s income', (incomeBasis) => {
    const result = computeTaxPlanning({
      ...salaryInput, recordedTaxableIncome: 0, recordedEmploymentIncome: 0, incomeBasis,
    })
    expect(result.grossTaxableIncome).toBe(0)
    expect(result.totalTax).toBe(0)
    expect(result.netAfterTax).toBe(0)
  })

  it('keeps the positional adapter while allowing explicit bonus eligibility', () => {
    const gig = computeTaxForFY('FY 2026-27', 1_500_000, 0, null, 'new', false)
    const bonus = computeTaxForFY('FY 2026-27', 1_500_000, 0, null, 'new', false, {
      hasEmploymentIncome: true,
    })
    expect(gig.totalTax).toBe(109_200)
    expect(bonus.totalTax).toBe(97_500)
  })

  it('grosses up employment receipts only when a FY also contains gross gig income', () => {
    const result = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: 1_500_000,
      recordedEmploymentIncome: 1_000_000,
      incomeBasis: 'net',
    })

    expect(Math.abs((result.grossEmploymentIncome ?? 0) - 1_002_400)).toBeLessThan(2)
    expect(result.otherTaxableIncome).toBe(500_000)
    expect(Math.abs(result.grossTaxableIncome - 1_502_400)).toBeLessThan(2)
    expect(Math.abs(result.totalTax - 100_274.4)).toBeLessThan(1)
    expect(result.estimatedTaxPaid).toBe(2_400)
    expect(result.estimatedTaxPaid).toBeLessThan(result.totalTax)
    expect(result.withholdingAssumption).toBe('employment_only')
    expect(result.incomeScopeComplete).toBe(true)
  })

  it('does not infer paid tax when employment exists but its amount is unspecified', () => {
    const result = computeTaxPlanning({
      ...salaryInput,
      recordedEmploymentIncome: undefined,
      incomeBasis: 'net',
    })
    expect(result.incomeScopeComplete).toBe(false)
    expect(result.incomeBasis).toBe('gross')
    expect(result.grossTaxableIncome).toBe(3_000_000)
    expect(result.estimatedTaxPaid).toBeNull()
    expect(result.grossEmploymentIncome).toBeNull()
    expect(result.otherTaxableIncome).toBeNull()
  })

  it('caps the salary deduction to employment earnings in a mixed-income FY', () => {
    const result = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: 1_510_000,
      recordedEmploymentIncome: 10_000,
      salaryMonthsCount: 0,
    })
    expect(result.standardDeduction).toBe(10_000)
    expect(result.totalTax).toBe(109_200)
    expect(result.otherTaxableIncome).toBe(1_500_000)
  })
})

describe('computeTaxForFY employment options', () => {
  it('retains positional defaults when employment options are omitted or undefined', () => {
    const result = computeTaxForFY('FY 2026-27', 3_000_000, 12, null, 'new')
    expect(result).toMatchObject({
      requestedIncomeBasis: 'net',
      incomeBasis: 'gross',
      hasEmploymentIncome: true,
      incomeScopeComplete: false,
      grossEmploymentIncome: null,
      employmentCashDeductions: 0,
      totalTax: 478_200,
    })
    expect(computeTaxForFY('FY 2026-27', 3_000_000, 12, null, 'new', true, {
      hasEmploymentIncome: undefined,
      recordedEmploymentIncome: undefined,
      recordedEmploymentCashDeductions: undefined,
    })).toEqual(result)
  })

  it('defaults eligibility from salary months while retaining explicit zero cash deductions', () => {
    const result = computeTaxForFY('FY 2026-27', 2_521_800, 12, null, 'new', undefined, {
      recordedEmploymentIncome: 2_521_800,
      recordedEmploymentCashDeductions: 0,
    })
    expect(result.hasEmploymentIncome).toBe(true)
    expect(result.incomeBasis).toBe('net')
    expect(result.employmentCashDeductions).toBe(0)
    expect(Math.abs(result.grossTaxableIncome - 3_000_000)).toBeLessThan(2)
    expect(Math.abs(result.totalTax - 478_200)).toBeLessThan(1)
    expect(Math.abs(result.netAfterCashDeductions - 2_521_800)).toBeLessThan(1)
  })

  it('preserves an explicit false employment flag despite positive salary months and amounts', () => {
    const result = computeTaxForFY('FY 2026-27', 1_500_000, 12, null, 'new', true, {
      hasEmploymentIncome: false,
      recordedEmploymentIncome: 1_500_000,
      recordedEmploymentCashDeductions: 43_200,
    })
    expect(result).toMatchObject({
      hasEmploymentIncome: false,
      grossTaxableIncome: 1_500_000,
      employmentCashDeductions: 0,
      standardDeduction: 0,
      professionalTax: 0,
      totalTax: 109_200,
    })
  })

  it('keeps an explicit zero employment amount distinct from an unspecified split', () => {
    const result = computeTaxForFY('FY 2026-27', 1_500_000, 12, null, 'new', true, {
      hasEmploymentIncome: true,
      recordedEmploymentIncome: 0,
      recordedEmploymentCashDeductions: 0,
    })
    expect(result).toMatchObject({
      incomeScopeComplete: true,
      grossEmploymentIncome: 0,
      otherTaxableIncome: 1_500_000,
      employmentCashDeductions: 0,
      standardDeduction: 0,
      professionalTax: 0,
      totalTax: 109_200,
    })
  })
})

describe('known employee cash deductions', () => {
  it.each([
    ['new', 2_478_600, 478_200],
    ['old', 2_229_000, 727_800],
  ] as const)('restores EPF before the %s-regime inverse without deducting it from taxable gross', (
    regimeOverride, bankReceipts, expectedTax,
  ) => {
    const result = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: bankReceipts,
      recordedEmploymentIncome: bankReceipts,
      recordedEmploymentCashDeductions: 43_200,
      incomeBasis: 'net',
      regimeOverride,
    })

    expect(Math.abs(result.grossTaxableIncome - 3_000_000)).toBeLessThan(2)
    expect(Math.abs(result.totalTax - expectedTax)).toBeLessThan(1)
    expect(result.estimatedTaxPaid).toBe(result.totalTax)
    expect(result.employmentCashDeductions).toBe(43_200)
    expect(Math.abs(result.netAfterCashDeductions - bankReceipts)).toBeLessThan(1)
    expect(result.netAfterTax - result.netAfterCashDeductions).toBeCloseTo(43_200, 6)
  })

  it('keeps gross-mode earnings and liability unchanged while reporting cash after EPF', () => {
    const result = computeTaxPlanning({
      ...salaryInput,
      recordedEmploymentCashDeductions: 43_200,
    })
    expect(result.grossTaxableIncome).toBe(3_000_000)
    expect(result.totalTax).toBe(478_200)
    expect(result.standardDeduction).toBe(75_000)
    expect(result.netAfterTax).toBe(2_521_800)
    expect(result.netAfterCashDeductions).toBe(2_478_600)
    expect(result.estimatedTaxPaid).toBeNull()
  })

  it('uses only the supplied recorded-period deduction during a partial FY', () => {
    const result = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: 492_400,
      recordedEmploymentIncome: 492_400,
      recordedEmploymentCashDeductions: 7_200,
      salaryMonthsCount: 2,
      incomeBasis: 'net',
    })
    expect(Math.abs(result.grossTaxableIncome - 500_000)).toBeLessThan(2)
    expect(result.totalTax).toBe(400)
    expect(result.employmentCashDeductions).toBe(7_200)
    expect(Math.abs(result.netAfterCashDeductions - 492_400)).toBeLessThan(1)
  })

  it('keeps gross business receipts separate while restoring salary EPF', () => {
    const result = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: 3_978_600,
      recordedEmploymentIncome: 2_478_600,
      recordedEmploymentCashDeductions: 43_200,
      incomeBasis: 'net',
    })
    expect(Math.abs((result.grossEmploymentIncome ?? 0) - 3_000_000)).toBeLessThan(2)
    expect(result.otherTaxableIncome).toBe(1_500_000)
    expect(Math.abs(result.totalTax - 946_200)).toBeLessThan(1)
    expect(Math.abs((result.estimatedTaxPaid ?? 0) - 478_200)).toBeLessThan(1)
    expect(Math.abs(result.netAfterCashDeductions - 3_510_600)).toBeLessThan(1)
  })

  it('does not apply an employee cash deduction to a business-only FY', () => {
    const result = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: 1_500_000,
      recordedEmploymentIncome: 0,
      recordedEmploymentCashDeductions: 43_200,
      hasEmploymentIncome: false,
      salaryMonthsCount: 0,
      incomeBasis: 'net',
    })
    expect(result.grossTaxableIncome).toBe(1_500_000)
    expect(result.employmentCashDeductions).toBe(0)
    expect(result.totalTax).toBe(109_200)
    expect(result.netAfterCashDeductions).toBe(1_390_800)
  })
})

describe('combined annual employment and other taxable income', () => {
  const projection = {
    projectedEmploymentIncome: 3_000_000,
    projectedEmploymentCashDeductions: 43_200,
    projectedSalaryMonthsCount: 12,
  }

  it.each([
    ['new', 946_200],
    ['old', 1_195_800],
  ] as const)('includes recorded business income in the %s-regime annual scenario', (regimeOverride, tax) => {
    const recordedTax = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: 1_500_000,
      recordedEmploymentIncome: 0,
      salaryMonthsCount: 0,
      hasEmploymentIncome: false,
      regimeOverride,
    })
    const annual = computeAnnualTaxPlanning({ ...projection, recordedTax })

    expect(annual?.grossTaxableIncome).toBe(4_500_000)
    expect(annual?.grossEmploymentIncome).toBe(3_000_000)
    expect(annual?.otherTaxableIncome).toBe(1_500_000)
    expect(annual?.totalTax).toBe(tax)
    expect(annual?.employmentCashDeductions).toBe(43_200)
    expect(annual?.selectedRegime).toBe(regimeOverride)
    expect(annual?.estimatedTaxPaid).toBeNull()
  })

  it('includes recorded employment within the full-year forecast instead of adding it again', () => {
    const recordedTax = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: 2_500_000,
      recordedEmploymentIncome: 1_000_000,
      recordedEmploymentCashDeductions: 14_400,
      salaryMonthsCount: 4,
    })
    const annual = computeAnnualTaxPlanning({ ...projection, recordedTax })

    expect(annual?.grossTaxableIncome).toBe(4_500_000)
    expect(annual?.totalTax).toBe(946_200)
    expect(annual?.salaryMonthsCount).toBe(12)
    expect(annual?.employmentCashDeductions).toBe(43_200)
  })

  it('counts gross RSUs already in employment once and retains known earnings above a forecast', () => {
    const recordedTax = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: 3_750_000,
      recordedEmploymentIncome: 3_250_000,
    })
    const annual = computeAnnualTaxPlanning({ ...projection, recordedTax })

    expect(annual?.grossEmploymentIncome).toBe(3_250_000)
    expect(annual?.grossTaxableIncome).toBe(3_750_000)
    expect(annual?.totalTax).toBe(712_200)
  })

  it('does not restore EPF or gross up net employment a second time in the annual scenario', () => {
    const recordedTax = computeTaxPlanning({
      ...salaryInput,
      recordedTaxableIncome: 2_478_600,
      recordedEmploymentIncome: 2_478_600,
      recordedEmploymentCashDeductions: 43_200,
      incomeBasis: 'net',
    })
    const annual = computeAnnualTaxPlanning({ ...projection, recordedTax })

    expect(Math.abs((annual?.grossTaxableIncome ?? 0) - 3_000_000)).toBeLessThan(2)
    expect(Math.abs((annual?.totalTax ?? 0) - 478_200)).toBeLessThan(1)
    expect(annual?.employmentCashDeductions).toBe(43_200)
  })

  it('does not combine a legacy recorded amount without its employment split', () => {
    const recordedTax = computeTaxPlanning({ ...salaryInput, recordedEmploymentIncome: undefined })
    expect(computeAnnualTaxPlanning({ ...projection, recordedTax })).toBeNull()
  })
})

describe('FY regime selection', () => {
  it.each([
    [false, 'new', 'new', 'old'],
    [true, 'old', 'new', 'old'],
    [true, 'new', 'old', 'new'],
    [true, null, 'old', 'old'],
    [true, null, 'new', 'new'],
  ] as const)('resolves availability %s, override %s, preference %s', (available, override, preferred, expected) => {
    expect(resolveSelectedRegime(available, override, preferred)).toBe(expected)
  })

  it.each([
    ['FY 2023-24', 50_000, 145_600],
    ['FY 2024-25', 75_000, 130_000],
    ['FY 2025-26', 75_000, 97_500],
    ['FY 2026-27', 75_000, 97_500],
  ] as const)('uses the configured deduction and slabs for %s', (selectedFY, deduction, tax) => {
    const result = computeTaxPlanning({
      ...salaryInput,
      selectedFY,
      recordedTaxableIncome: 1_500_000,
      recordedEmploymentIncome: 1_500_000,
      salaryMonthsCount: 0,
    })
    expect(result.standardDeduction).toBe(deduction)
    expect(result.totalTax).toBe(tax)
  })

  it('forces the old regime before the new regime was available', () => {
    const result = computeTaxPlanning({
      ...salaryInput,
      selectedFY: 'FY 2019-20',
      regimeOverride: 'new',
    })
    expect(result.newRegimeAvailable).toBe(false)
    expect(result.selectedRegime).toBe('old')
    expect(result.totalTax).toBe(727_800)
  })

  it.each([
    ['new', 2025, 1_275_100],
    ['new', 2024, 775_100],
    ['new', 2026, 5_075_100],
    ['old', 2026, 5_050_100],
    ['old', 2024, 1_000_000],
  ] as const)('uses the same engine on %s FY %i threshold income %i', (regime, fyYear, grossIncome) => {
    const engine = calculateTax(
      grossIncome, getTaxSlabs(fyYear, regime), getStandardDeduction(fyYear, regime),
      true, 12, regime === 'new', fyYear,
    )
    const gross = computeTaxPlanning({
      ...salaryInput,
      selectedFY: `FY ${fyYear}-${String(fyYear + 1).slice(-2)}`,
      recordedTaxableIncome: grossIncome,
      recordedEmploymentIncome: grossIncome,
      regimeOverride: regime,
    })
    const net = computeTaxPlanning({
      ...salaryInput,
      selectedFY: `FY ${fyYear}-${String(fyYear + 1).slice(-2)}`,
      recordedTaxableIncome: grossIncome - engine.totalTax,
      recordedEmploymentIncome: grossIncome - engine.totalTax,
      regimeOverride: regime,
      incomeBasis: 'net',
    })

    expect(gross.totalTax).toBe(engine.totalTax)
    expect(Math.abs(net.netAfterTax - (grossIncome - engine.totalTax))).toBeLessThan(1)
  })
})

function comparisonTax(grossIncome: number, regime: TaxRegime, deductions: number, employment: boolean) {
  return calculateTax(
    Math.max(0, grossIncome - deductions),
    getTaxSlabs(2026, regime),
    employment ? getStandardDeduction(2026, regime) : 0,
    employment,
    0,
    regime === 'new',
    2026,
  ).totalTax
}

describe('regime comparison and deduction threshold', () => {
  it('compares gig income without granting either regime a salary deduction', () => {
    const result = compareTaxRegimes({
      grossIncome: 1_500_000,
      fyYear: 2026,
      salaryMonthsCount: 0,
      hasEmploymentIncome: false,
    })
    expect(result?.newTax.standardDeduction).toBe(0)
    expect(result?.oldTax.standardDeduction).toBe(0)
    expect(result?.newTax.totalTax).toBe(109_200)
    expect(result?.oldTax.totalTax).toBe(273_000)
    expect(result?.newIsBetter).toBe(true)
    expect(result?.difference).toBe(163_800)
  })

  it('applies entered deductions only to the old-regime comparison', () => {
    const input = {
      grossIncome: 1_500_000, fyYear: 2026, salaryMonthsCount: 12, hasEmploymentIncome: true,
    }
    const initial = compareTaxRegimes(input)
    const deducted = compareTaxRegimes({ ...input, oldRegimeDeductions: 750_000 })
    expect(deducted?.newTax).toEqual(initial?.newTax)
    expect(deducted?.oldTax.totalTax).toBeLessThan(initial?.oldTax.totalTax ?? 0)
    expect(deducted?.oldIsBetter).toBe(true)
  })

  it('caps both regime deductions to the supplied gross employment portion', () => {
    const result = compareTaxRegimes({
      grossIncome: 1_510_000,
      employmentIncome: 10_000,
      fyYear: 2026,
      salaryMonthsCount: 0,
      hasEmploymentIncome: true,
    })
    expect(result?.newTax.standardDeduction).toBe(10_000)
    expect(result?.oldTax.standardDeduction).toBe(10_000)
    expect(result?.newTax.totalTax).toBe(109_200)
    expect(result?.oldTax.totalTax).toBe(273_000)
  })

  it('reports an equal result explicitly', () => {
    const result = compareTaxRegimes({
      grossIncome: 400_000, fyYear: 2026, salaryMonthsCount: 0, hasEmploymentIncome: false,
    })
    expect(result?.equalTax).toBe(true)
    expect(result?.newIsBetter).toBe(false)
    expect(result?.oldIsBetter).toBe(false)
    expect(result?.difference).toBe(0)
    expect(result?.breakEvenDeduction).toBe(0)
  })

  it('does not present a comparison for unavailable regimes or empty income', () => {
    const input = { grossIncome: 1_500_000, fyYear: 2019, salaryMonthsCount: 0, hasEmploymentIncome: true }
    expect(compareTaxRegimes(input)).toBeNull()
    expect(compareTaxRegimes({ ...input, fyYear: 2026, grossIncome: 0 })).toBeNull()
  })

  it.each([
    [1_275_000, true],
    [1_500_000, true],
    [1_500_000, false],
    [2_400_000, true],
    [5_100_000, false],
  ] as const)('finds a minimal whole-rupee threshold at %i, employment %s', (grossIncome, employment) => {
    const newTax = comparisonTax(grossIncome, 'new', 0, employment)
    const deduction = calculateBreakEvenDeduction(grossIncome, 2026, 0, newTax, employment)
    expect(deduction).not.toBeNull()
    expect(Number.isInteger(deduction)).toBe(true)
    expect(deduction).toBeGreaterThan(0)
    const threshold = deduction ?? 0
    expect(Math.round(comparisonTax(grossIncome, 'old', threshold, employment) * 100))
      .toBeLessThanOrEqual(Math.round(newTax * 100))
    expect(Math.round(comparisonTax(grossIncome, 'old', threshold - 1, employment) * 100))
      .toBeGreaterThan(Math.round(newTax * 100))
  })

  it('distinguishes no deductions needed from an unreachable search limit', () => {
    expect(calculateBreakEvenDeduction(400_000, 2026, 0, 0, false)).toBe(0)
    expect(calculateBreakEvenDeduction(1_500_000, 2026, 0, 97_500, true, 100_000)).toBeNull()
  })

  it('returns a rebate-cliff boundary exactly rather than rounding up by 10,000', () => {
    expect(calculateBreakEvenDeduction(1_275_001, 2026, 0, 0, true)).toBe(725_001)
  })
})

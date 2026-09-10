import {
  calculateGrossFromNet,
  calculateTax,
  getStandardDeduction,
  getTaxSlabs,
  parseFYStartYear,
} from '@/lib/taxCalculator'
import type { GrossFromNetOptions } from '@/lib/taxCalculator'
import type { Transaction } from '@/types'

export type TaxRegime = 'new' | 'old'
export type TaxRegimeOverride = TaxRegime | null
export type TaxIncomeBasis = 'gross' | 'net'

export interface IncomeGroupAccumulator {
  [key: string]: {
    total: number
    transactions: Transaction[]
  }
}

export interface FYData {
  income: number
  expense: number
  taxableIncome: number
  employmentTaxableIncome: number
  /** Known employee deductions for recorded salary months, not tax deductions. */
  recordedEmploymentCashDeductions?: number
  hasEmploymentIncome: boolean
  salaryMonths: Set<string>
  transactions: Transaction[]
  incomeGroups: IncomeGroupAccumulator
}

export interface IncomeClassification {
  taxable: string[]
  investmentReturns: string[]
  nonTaxable: string[]
  other: string[]
}

export interface YearlyTaxDatum {
  fy: string
  /** Legacy chart key: tax liability on recorded income, not proof of payment. */
  paidTax: number
  projected: number
  cumulative: number
}

export interface TaxPlanningInput {
  selectedFY: string
  recordedTaxableIncome: number
  recordedEmploymentIncome?: number
  /** Cash withheld from employment receipts, such as known period employee EPF. */
  recordedEmploymentCashDeductions?: number
  salaryMonthsCount: number
  hasEmploymentIncome: boolean
  incomeBasis: TaxIncomeBasis
  regimeOverride?: TaxRegimeOverride
  preferredRegime?: string
}

export function resolveSelectedRegime(
  newRegimeAvailable: boolean,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
): TaxRegime {
  if (!newRegimeAvailable) return 'old'
  if (regimeOverride) return regimeOverride
  return preferredRegime === 'old' ? 'old' : 'new'
}

function resolveIncomeScope(input: Readonly<TaxPlanningInput>) {
  const incomeScopeComplete = !input.hasEmploymentIncome || input.recordedEmploymentIncome !== undefined
  const employmentIncome = input.hasEmploymentIncome ? Math.max(0, input.recordedEmploymentIncome ?? 0) : 0
  const hasEmploymentIncome = input.hasEmploymentIncome &&
    (incomeScopeComplete ? employmentIncome > 0 : input.recordedTaxableIncome > 0)
  const incomeBasis: TaxIncomeBasis = input.incomeBasis === 'net' && hasEmploymentIncome && incomeScopeComplete
    ? 'net'
    : 'gross'
  return {
    incomeScopeComplete,
    hasEmploymentIncome,
    incomeBasis,
    employmentIncome,
    otherIncome: input.recordedTaxableIncome - employmentIncome,
  }
}

function taxForIncome(grossIncome: number, options: GrossFromNetOptions) {
  return calculateTax(
    grossIncome,
    options.slabs,
    options.standardDeduction,
    options.applyProfessionalTax,
    options.salaryMonthsCount,
    options.isNewRegime,
    options.fyStartYear,
  )
}

/** Net-of-TDS applies to employment receipts; other taxable receipts stay gross. */
export function computeTaxPlanning(input: Readonly<TaxPlanningInput>) {
  const fyYear = input.selectedFY ? parseFYStartYear(input.selectedFY) : 0
  const newRegimeAvailable = fyYear >= 2020
  const selectedRegime = resolveSelectedRegime(
    newRegimeAvailable, input.regimeOverride ?? null, input.preferredRegime ?? 'new',
  )
  const isNewRegime = selectedRegime === 'new'
  const taxSlabs = getTaxSlabs(fyYear, selectedRegime)
  const scope = resolveIncomeScope(input)
  const employmentDeduction = scope.hasEmploymentIncome
    ? getStandardDeduction(fyYear, selectedRegime)
    : 0
  const options: GrossFromNetOptions = {
    slabs: taxSlabs,
    standardDeduction: employmentDeduction,
    applyProfessionalTax: scope.hasEmploymentIncome,
    salaryMonthsCount: input.salaryMonthsCount,
    isNewRegime,
    fyStartYear: fyYear,
  }
  const employmentCashDeductions = scope.hasEmploymentIncome && scope.incomeScopeComplete
    ? Math.max(0, input.recordedEmploymentCashDeductions ?? 0)
    : 0
  const grossEmploymentIncome = scope.incomeBasis === 'net'
    ? calculateGrossFromNet(scope.employmentIncome + employmentCashDeductions, options)
    : scope.employmentIncome
  const grossTaxableIncome = scope.incomeBasis === 'net'
    ? grossEmploymentIncome + scope.otherIncome
    : input.recordedTaxableIncome
  const standardDeduction = scope.incomeScopeComplete
    ? Math.min(employmentDeduction, grossEmploymentIncome)
    : employmentDeduction
  const taxResult = taxForIncome(grossTaxableIncome, { ...options, standardDeduction })
  const estimatedTaxPaid = scope.incomeBasis === 'net'
    ? taxForIncome(grossEmploymentIncome, { ...options, standardDeduction }).totalTax
    : null

  return {
    selectedFY: input.selectedFY,
    fyYear,
    newRegimeAvailable,
    selectedRegime,
    isNewRegime,
    taxSlabs,
    regimeLabel: isNewRegime ? 'New Tax Regime' : 'Old Tax Regime',
    standardDeduction,
    salaryMonthsCount: input.salaryMonthsCount,
    hasEmploymentIncome: scope.hasEmploymentIncome,
    requestedIncomeBasis: input.incomeBasis,
    incomeBasis: scope.incomeBasis,
    incomeScopeComplete: scope.incomeScopeComplete,
    withholdingAssumption: scope.incomeBasis === 'net' ? 'employment_only' as const : null,
    grossEmploymentIncome: scope.incomeScopeComplete ? grossEmploymentIncome : null,
    otherTaxableIncome: scope.incomeScopeComplete ? scope.otherIncome : null,
    employmentCashDeductions,
    grossTaxableIncome,
    netAfterTax: grossTaxableIncome - taxResult.totalTax,
    netAfterCashDeductions: grossTaxableIncome - taxResult.totalTax - employmentCashDeductions,
    baseTax: taxResult.tax,
    slabBreakdown: taxResult.slabBreakdown,
    rebate87A: taxResult.rebate87A,
    surcharge: taxResult.surcharge,
    cess: taxResult.cess,
    professionalTax: taxResult.professionalTax,
    totalTax: taxResult.totalTax,
    estimatedTaxPaid,
    // Compatibility for paid-tax consumers; gross receipts do not prove payment.
    taxAlreadyPaid: estimatedTaxPaid ?? 0,
  }
}

export type TaxPlanningResult = ReturnType<typeof computeTaxPlanning>

export interface AnnualTaxPlanningInput {
  recordedTax: TaxPlanningResult
  /** Full-year employment gross, including gross RSU vesting income. */
  projectedEmploymentIncome: number
  projectedEmploymentCashDeductions: number
  projectedSalaryMonthsCount: number
}

/**
 * A full-year employment forecast includes employment already recorded.
 * Keep known employment as a floor and add other recorded taxable income once.
 * An incomplete split cannot safely be combined with an employment forecast.
 */
export function computeAnnualTaxPlanning({
  recordedTax,
  projectedEmploymentIncome,
  projectedEmploymentCashDeductions,
  projectedSalaryMonthsCount,
}: Readonly<AnnualTaxPlanningInput>): TaxPlanningResult | null {
  if (recordedTax.grossEmploymentIncome === null || recordedTax.otherTaxableIncome === null) return null

  const employmentIncome = Math.max(recordedTax.grossEmploymentIncome, projectedEmploymentIncome)
  return computeTaxPlanning({
    selectedFY: recordedTax.selectedFY,
    recordedTaxableIncome: employmentIncome + recordedTax.otherTaxableIncome,
    recordedEmploymentIncome: employmentIncome,
    recordedEmploymentCashDeductions: Math.max(
      recordedTax.employmentCashDeductions, projectedEmploymentCashDeductions,
    ),
    salaryMonthsCount: Math.max(recordedTax.salaryMonthsCount, projectedSalaryMonthsCount),
    hasEmploymentIncome: employmentIncome > 0,
    incomeBasis: 'gross',
    regimeOverride: recordedTax.selectedRegime,
  })
}

export type TaxEmploymentOptions = Partial<Pick<
  TaxPlanningInput,
  'hasEmploymentIncome' | 'recordedEmploymentIncome' | 'recordedEmploymentCashDeductions'
>>

/** Retains the first six positional arguments; employment details are named. */
export function computeTaxForFY(
  selectedFY: string,
  recordedTaxableIncome: number,
  salaryMonthsCount: number,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
  salaryIsNetOfTds = true,
  employment: Readonly<TaxEmploymentOptions> = {},
): TaxPlanningResult {
  const {
    hasEmploymentIncome = salaryMonthsCount > 0,
    recordedEmploymentIncome,
    recordedEmploymentCashDeductions = 0,
  } = employment
  return computeTaxPlanning({
    selectedFY,
    recordedTaxableIncome,
    recordedEmploymentIncome,
    recordedEmploymentCashDeductions,
    salaryMonthsCount,
    regimeOverride,
    preferredRegime,
    incomeBasis: salaryIsNetOfTds ? 'net' : 'gross',
    hasEmploymentIncome,
  })
}

export interface RegimeComparisonInput {
  grossIncome: number
  fyYear: number
  salaryMonthsCount: number
  hasEmploymentIncome: boolean
  employmentIncome?: number
  oldRegimeDeductions?: number
}

function calculateRegimeTax(
  input: Readonly<RegimeComparisonInput>,
  regime: TaxRegime,
  deductions = 0,
) {
  const employmentIncome = Math.max(0, input.employmentIncome ?? input.grossIncome)
  const hasEmploymentIncome = input.hasEmploymentIncome && employmentIncome > 0
  const standardDeduction = hasEmploymentIncome
    ? Math.min(getStandardDeduction(input.fyYear, regime), employmentIncome)
    : 0
  const result = calculateTax(
    Math.max(0, input.grossIncome - deductions),
    getTaxSlabs(input.fyYear, regime),
    standardDeduction,
    hasEmploymentIncome,
    input.salaryMonthsCount,
    regime === 'new',
    input.fyYear,
  )
  return { ...result, standardDeduction }
}

const BREAK_EVEN_DEDUCTION_LIMIT = 1_000_000

/**
 * Least whole-rupee deduction at which old-regime tax matches or beats the
 * target. Null means it cannot match within the stated search limit.
 */
export function calculateBreakEvenDeduction(
  grossIncome: number,
  fyYear: number,
  salaryMonthsCount: number,
  newRegimeTax: number,
  hasEmploymentIncome = salaryMonthsCount > 0,
  maxDeduction = BREAK_EVEN_DEDUCTION_LIMIT,
  employmentIncome?: number,
): number | null {
  const input = { grossIncome, fyYear, salaryMonthsCount, hasEmploymentIncome, employmentIncome }
  const targetPaise = Math.round(newRegimeTax * 100)
  const matchesTarget = (deduction: number) =>
    Math.round(calculateRegimeTax(input, 'old', deduction).totalTax * 100) <= targetPaise

  if (matchesTarget(0)) return 0
  let low = 0
  let high = Math.floor(Math.min(Math.max(0, grossIncome), maxDeduction))
  if (!matchesTarget(high)) return null
  while (high - low > 1) {
    const midpoint = Math.floor((low + high) / 2)
    if (matchesTarget(midpoint)) high = midpoint
    else low = midpoint
  }
  return high
}

export function compareTaxRegimes(input: Readonly<RegimeComparisonInput>) {
  if (input.fyYear < 2020 || input.grossIncome <= 0) return null

  const totalDeductions = Math.max(0, input.oldRegimeDeductions ?? 0)
  const newTax = calculateRegimeTax(input, 'new')
  const oldTax = calculateRegimeTax(input, 'old', totalDeductions)
  const differencePaise = Math.round(newTax.totalTax * 100) - Math.round(oldTax.totalTax * 100)
  const newIsBetter = differencePaise < 0
  const oldIsBetter = differencePaise > 0
  const breakEvenDeduction = newIsBetter
    ? calculateBreakEvenDeduction(
        input.grossIncome,
        input.fyYear,
        input.salaryMonthsCount,
        newTax.totalTax,
        input.hasEmploymentIncome,
        BREAK_EVEN_DEDUCTION_LIMIT,
        input.employmentIncome,
      )
    : 0

  return {
    newTax,
    oldTax,
    totalDeductions,
    equalTax: differencePaise === 0,
    newIsBetter,
    oldIsBetter,
    difference: Math.abs(differencePaise) / 100,
    newEffectiveRate: (newTax.totalTax / input.grossIncome) * 100,
    oldEffectiveRate: (oldTax.totalTax / input.grossIncome) * 100,
    breakEvenDeduction,
    breakEvenLimit: BREAK_EVEN_DEDUCTION_LIMIT,
    additionalDeductionToBreakEven: breakEvenDeduction === null
      ? null
      : Math.max(0, breakEvenDeduction - totalDeductions),
  }
}

import { classifyIncomeType } from '@/lib/preferencesUtils'
import { MONTHS_PER_YEAR } from '@/lib/dateUtils'
import {
  getFYFromDate,
  parseFYStartYear,
} from '@/lib/taxCalculator'
import { computeAnnualTaxPlanning, computeTaxForFY } from './taxPlanning'
import { projectFiscalYear } from '@/lib/projectionCalculator'
import { applyProjectionTaxRegime, taxPlanningDisplay } from './payrollPlanning'
import { withIncomeClassificationDefaults } from '@/store/preferencesStore'
import type { Transaction } from '@/types'
import type {
  GrowthAssumptions,
  ProjectedFYBreakdown,
  RsuGrant,
  SalaryComponents,
} from '@/types/salary'
import type {
  FYData,
  IncomeClassification,
  TaxRegimeOverride,
  YearlyTaxDatum,
} from './taxPlanning'

/** Create an empty FY data bucket */
export function createEmptyFYData(): FYData {
  return {
    income: 0,
    expense: 0,
    taxableIncome: 0,
    employmentTaxableIncome: 0,
    recordedEmploymentCashDeductions: 0,
    hasEmploymentIncome: false,
    salaryMonths: new Set(),
    transactions: [],
    incomeGroups: {
      'Salary & Stipend': { total: 0, transactions: [] },
      Bonus: { total: 0, transactions: [] },
      EPF: { total: 0, transactions: [] },
      'Other Taxable Income': { total: 0, transactions: [] },
    },
  }
}

/**
 * Classify and accumulate an income transaction into the FY group.
 *
 * @param epfTaxableFraction  Fraction (0..1) of an EPF inflow counted as
 *   taxable. Defaults to 0 (exempt) -- the common post-5-year-service case.
 *   The user sets this in Settings (EPF withdrawal taxable toggle + percent);
 *   the old code hardcoded 0.5, which had no basis in EPF withdrawal rules.
 */
export function classifyAndAccumulateIncome(
  tx: Transaction,
  fyData: FYData,
  incomeClassification: IncomeClassification,
  epfTaxableFraction = 0,
): void {
  const incomeType = classifyIncomeType(tx, incomeClassification)
  const note = tx.note?.toLowerCase() ?? ''
  const subcategory = (tx.subcategory ?? '').toLowerCase()

  const isEPF =
    note.includes('aws epf') ||
    note.includes('epf withdrawal') ||
    (tx.category === 'Employment Income' && tx.subcategory === 'EPF Contribution')

  if (isEPF) {
    const epfTaxablePortion = tx.amount * epfTaxableFraction
    // Always record the full EPF inflow in its group for display; only the
    // taxable fraction feeds taxableIncome.
    fyData.taxableIncome += epfTaxablePortion
    fyData.incomeGroups.EPF.total += epfTaxablePortion
    fyData.incomeGroups.EPF.transactions.push(tx)
    return
  }

  if (incomeType !== 'taxable') return

  fyData.taxableIncome += tx.amount
  if (tx.category === 'Employment Income') {
    fyData.employmentTaxableIncome += tx.amount
    fyData.hasEmploymentIncome = fyData.employmentTaxableIncome > 0
  }
  const isSalaryOrStipend = subcategory === 'salary' || subcategory === 'stipend'
  const isBonus = subcategory === 'bonuses' || subcategory === 'rsus'

  if (isSalaryOrStipend) {
    fyData.incomeGroups['Salary & Stipend'].total += tx.amount
    fyData.incomeGroups['Salary & Stipend'].transactions.push(tx)
    if (tx.category === 'Employment Income') fyData.salaryMonths.add(tx.date.substring(0, 7))
  } else if (isBonus) {
    fyData.incomeGroups['Bonus'].total += tx.amount
    fyData.incomeGroups['Bonus'].transactions.push(tx)
  } else {
    fyData.incomeGroups['Other Taxable Income'].total += tx.amount
    fyData.incomeGroups['Other Taxable Income'].transactions.push(tx)
  }
}

/**
 * Group transactions by fiscal year, accumulating income/expense totals.
 *
 * `incomeClassification` is resolved through `withIncomeClassificationDefaults`
 * before use. `useTaxPlanning` builds it with `?? []` per field straight off the
 * API payload, and the backend column default is the JSON string `"[]"`, so an
 * unconfigured user arrives here with four empty lists. `classifyIncomeType`
 * then matches nothing, `incomeType !== 'taxable'` skips every credit, and the
 * whole page reports zero taxable income and zero tax. The resolver restores the
 * shipped defaults for that all-empty case while still honouring a real
 * (partition-driven) empty list when any sibling is populated.
 */
export function groupTransactionsByFY(
  transactions: Transaction[],
  fiscalYearStartMonth: number,
  incomeClassification: IncomeClassification,
  epfTaxableFraction = 0,
  salaryStructure: Readonly<Record<string, Pick<SalaryComponents, 'epf_monthly'>>> = {},
): Record<string, FYData> {
  const resolvedClassification = withIncomeClassificationDefaults(incomeClassification)
  const grouped: Record<string, FYData> = {}
  for (const tx of transactions) {
    const fy = getFYFromDate(tx.date, fiscalYearStartMonth)
    if (!grouped[fy]) grouped[fy] = createEmptyFYData()
    grouped[fy].transactions.push(tx)
    if (tx.type === 'Income') {
      grouped[fy].income += tx.amount
      classifyAndAccumulateIncome(tx, grouped[fy], resolvedClassification, epfTaxableFraction)
    } else if (tx.type === 'Expense') {
      grouped[fy].expense += tx.amount
    }
  }
  // Only explicit settings for that FY establish recorded employee deductions.
  // Do not back-project a later salary's EPF into years with unknown payroll.
  const configuredEpfByYear = new Map(
    Object.entries(salaryStructure).map(([fy, salary]) => [
      parseFYStartYear(fy), Math.max(0, Number(salary.epf_monthly) || 0),
    ]),
  )
  for (const [fy, data] of Object.entries(grouped)) {
    data.recordedEmploymentCashDeductions = data.hasEmploymentIncome
      ? (configuredEpfByYear.get(parseFYStartYear(fy)) ?? 0)
        * Math.min(data.salaryMonths.size, MONTHS_PER_YEAR)
      : 0
  }
  return grouped
}

function computeGroupedTax(
  fy: string,
  fyData: FYData,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
  salaryIsNetOfTds = true,
) {
  // Use the classified taxable income, never a fallback to gross inflow.
  // fyData.income is ALL credits (incl. transfers, refunds, cashbacks,
  // investment returns) -- taxing that overstates tax badly. When nothing is
  // classified as taxable this yields 0, which is correct: the UI nudges the
  // user to classify income rather than fabricating tax on raw inflow.
  const taxableAmt = fyData.taxableIncome
  const salaryMonths = fyData.salaryMonths?.size || 0
  const computed = computeTaxForFY(
    fy, taxableAmt, salaryMonths, regimeOverride, preferredRegime,
    salaryIsNetOfTds, {
      hasEmploymentIncome: fyData.hasEmploymentIncome,
      recordedEmploymentIncome: fyData.employmentTaxableIncome,
      recordedEmploymentCashDeductions: fyData.recordedEmploymentCashDeductions,
    },
  )
  return computed
}

export function computePaidTax(
  fy: string,
  fyData: FYData,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
  salaryIsNetOfTds = true,
): number {
  const computed = computeGroupedTax(fy, fyData, regimeOverride, preferredRegime, salaryIsNetOfTds)
  return Math.round(computed.estimatedTaxPaid ?? 0)
}

/** Preserve recorded statement tax when it exceeds the computed estimate. */
export function reconcileTaxWithholding(computedTax: number, recordedTax: number) {
  const tdsAtSource = Math.max(0, computedTax - recordedTax)
  return { tdsAtSource, taxTotal: recordedTax + tdsAtSource }
}

export function computeProjectedTax(
  hasTxData: boolean,
  projTotal: number,
  recordedIncomeTax: number,
  fy: string,
  currentFYLabel: string,
): number {
  if (!hasTxData && projTotal > 0) return projTotal
  if (parseFYStartYear(fy) >= parseFYStartYear(currentFYLabel) && projTotal > recordedIncomeTax) {
    return projTotal - recordedIncomeTax
  }
  return 0
}

/** Annual liability on recorded income, plus the remaining full-year projection. */
export function buildYearlyTaxData(
  fyList: string[],
  transactionsByFY: Record<string, FYData>,
  multiYearProjections: readonly Pick<ProjectedFYBreakdown, 'fy' | 'grossTaxable' | 'cashDeductions'>[],
  currentFYLabel: string,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
  salaryIsNetOfTds = true,
): YearlyTaxDatum[] {
  const projectionsByYear = new Map(
    multiYearProjections.map((projection) => [parseFYStartYear(projection.fy), projection]),
  )

  const data = fyList
    .slice()
    .reverse()
    .map((fy) => {
      const fyData = transactionsByFY[fy]
      const hasTxData = !!fyData
      const recordedTax = computeGroupedTax(
        fy, fyData ?? createEmptyFYData(), regimeOverride, preferredRegime, salaryIsNetOfTds,
      )
      const projection = projectionsByYear.get(parseFYStartYear(fy))
      const annualTax = projection ? computeAnnualTaxPlanning({
        recordedTax,
        projectedEmploymentIncome: projection.grossTaxable,
        projectedEmploymentCashDeductions: projection.cashDeductions,
        projectedSalaryMonthsCount: projection.grossTaxable > 0 ? MONTHS_PER_YEAR : 0,
      }) : null
      const projTotal = Math.round(annualTax?.totalTax ?? 0)
      const recordedIncomeTax = Math.round(recordedTax.totalTax)
      const projected = computeProjectedTax(hasTxData, projTotal, recordedIncomeTax, fy, currentFYLabel)

      return { fy, paidTax: recordedIncomeTax, projected, cumulative: 0 }
    })

  let cum = 0
  for (const d of data) {
    cum += d.paidTax + d.projected
    d.cumulative = cum
  }
  return data
}

export interface PrevFYDisplayParams {
  effectiveFY: string
  currentFYLabel: string
  transactionsByFY: Record<string, FYData>
  regimeOverride: TaxRegimeOverride
  preferredRegime: string
  hasSalaryData: boolean
  salaryStructure: Record<string, SalaryComponents>
  rsuGrants: RsuGrant[]
  growthAssumptions: GrowthAssumptions
  fiscalYearStartMonth: number
  isNewRegime: boolean
  salaryIsNetOfTds?: boolean
}

/** Compute the previous FY's display values for YoY comparison badges */
export function computePrevFYDisplay(
  params: PrevFYDisplayParams,
): { net: number; gross: number; totalTax: number } | null {
  const {
    effectiveFY,
    currentFYLabel,
    transactionsByFY,
    regimeOverride,
    preferredRegime,
    hasSalaryData,
    salaryStructure,
    rsuGrants,
    growthAssumptions,
    fiscalYearStartMonth,
    salaryIsNetOfTds = true,
  } = params
  if (!effectiveFY) return null
  const startYear = parseFYStartYear(effectiveFY)
  if (!startYear) return null
  const prevStart = startYear - 1
  const prevEnd = startYear % 100
  const prevFYLabel = `FY ${prevStart}-${String(prevEnd).padStart(2, '0')}`

  const currentStart = parseFYStartYear(currentFYLabel)
  const prevIsComplete = prevStart < currentStart
  const prevFYData = transactionsByFY[prevFYLabel]
  const recordedTax = computeGroupedTax(
    prevFYLabel, prevFYData ?? createEmptyFYData(), regimeOverride, preferredRegime, salaryIsNetOfTds,
  )

  if (prevIsComplete && prevFYData) {
    return {
      net: recordedTax.netAfterCashDeductions,
      gross: recordedTax.grossTaxableIncome,
      totalTax: recordedTax.totalTax,
    }
  }

  if (hasSalaryData) {
    const prevFYForProjector = prevFYLabel.replace(/^FY\s+/i, '')
    const prevProjection = projectFiscalYear(
      prevFYForProjector,
      salaryStructure,
      rsuGrants,
      growthAssumptions,
      fiscalYearStartMonth,
    )
    if (prevProjection) {
      const selectedProjection = applyProjectionTaxRegime(prevProjection, recordedTax.selectedRegime)
      const annualTax = computeAnnualTaxPlanning({
        recordedTax,
        projectedEmploymentIncome: prevProjection.grossTaxable,
        projectedEmploymentCashDeductions: prevProjection.cashDeductions,
        projectedSalaryMonthsCount: prevProjection.grossTaxable > 0 ? MONTHS_PER_YEAR : 0,
      })
      const { net, gross, totalTax } = taxPlanningDisplay(
        recordedTax, selectedProjection, prevFYData?.income ?? 0, annualTax,
      )
      return { net, gross, totalTax }
    }
  }

  return null
}

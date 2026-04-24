import { classifyIncomeType } from '@/lib/preferencesUtils'
import {
  calculateTax,
  calculateGrossFromNet,
  getFYFromDate,
  getStandardDeduction,
  parseFYStartYear,
  getTaxSlabs,
  getNewRegimeSlabs,
} from '@/lib/taxCalculator'
import { projectFiscalYear } from '@/lib/projectionCalculator'
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
} from './types'

/** Create an empty FY data bucket */
export function createEmptyFYData(): FYData {
  return {
    income: 0,
    expense: 0,
    taxableIncome: 0,
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

/** Classify and accumulate an income transaction into the FY group */
export function classifyAndAccumulateIncome(
  tx: Transaction,
  fyData: FYData,
  incomeClassification: IncomeClassification,
): void {
  const incomeType = classifyIncomeType(tx, incomeClassification)
  const note = tx.note?.toLowerCase() || ''
  const subcategory = (tx.subcategory || '').toLowerCase()

  const isEPF =
    note.includes('aws epf') ||
    note.includes('epf withdrawal') ||
    (tx.category === 'Employment Income' && tx.subcategory === 'EPF Contribution')

  if (isEPF) {
    const epfTaxablePortion = tx.amount / 2
    fyData.taxableIncome += epfTaxablePortion
    fyData.incomeGroups.EPF.total += epfTaxablePortion
    fyData.incomeGroups.EPF.transactions.push(tx)
    return
  }

  if (incomeType !== 'taxable') return

  fyData.taxableIncome += tx.amount
  const isSalaryOrStipend = subcategory === 'salary' || subcategory === 'stipend'
  const isBonus = subcategory === 'bonuses' || subcategory === 'rsus'

  if (isSalaryOrStipend) {
    fyData.incomeGroups['Salary & Stipend'].total += tx.amount
    fyData.incomeGroups['Salary & Stipend'].transactions.push(tx)
    fyData.salaryMonths.add(tx.date.substring(0, 7))
  } else if (isBonus) {
    fyData.incomeGroups['Bonus'].total += tx.amount
    fyData.incomeGroups['Bonus'].transactions.push(tx)
  } else {
    fyData.incomeGroups['Other Taxable Income'].total += tx.amount
    fyData.incomeGroups['Other Taxable Income'].transactions.push(tx)
  }
}

/** Group transactions by fiscal year, accumulating income/expense totals */
export function groupTransactionsByFY(
  transactions: Transaction[],
  fiscalYearStartMonth: number,
  incomeClassification: IncomeClassification,
): Record<string, FYData> {
  const grouped: Record<string, FYData> = {}
  for (const tx of transactions) {
    const fy = getFYFromDate(tx.date, fiscalYearStartMonth)
    if (!grouped[fy]) grouped[fy] = createEmptyFYData()
    grouped[fy].transactions.push(tx)
    if (tx.type === 'Income') {
      grouped[fy].income += tx.amount
      classifyAndAccumulateIncome(tx, grouped[fy], incomeClassification)
    } else if (tx.type === 'Expense') {
      grouped[fy].expense += tx.amount
    }
  }
  return grouped
}

/** Determine the selected tax regime based on FY availability and user preference */
export function resolveSelectedRegime(
  newRegimeAvailable: boolean,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
): 'new' | 'old' {
  if (!newRegimeAvailable) return 'old'
  if (regimeOverride) return regimeOverride
  return preferredRegime === 'old' ? 'old' : 'new'
}

/** Compute gross income and tax breakdown for the selected FY and regime */
export function computeTaxForFY(
  selectedFY: string,
  netTaxableIncome: number,
  salaryMonthsCount: number,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
) {
  const fyYear = selectedFY ? parseFYStartYear(selectedFY) : 0
  const newRegimeAvailable = fyYear >= 2020
  const selectedRegime = resolveSelectedRegime(newRegimeAvailable, regimeOverride, preferredRegime)
  const isNewRegime = selectedRegime === 'new'
  const taxSlabs = getTaxSlabs(fyYear, selectedRegime)
  const regimeLabel = isNewRegime ? 'New Tax Regime' : 'Old Tax Regime (with 80C)'
  const standardDeduction = getStandardDeduction(fyYear)

  const hasEmploymentIncome = netTaxableIncome > 0
  const newRegimeSlabs = getNewRegimeSlabs(fyYear)

  const grossTaxableIncome = calculateGrossFromNet(netTaxableIncome, {
    slabs: newRegimeSlabs,
    standardDeduction,
    applyProfessionalTax: hasEmploymentIncome,
    salaryMonthsCount,
    isNewRegime: true,
    fyStartYear: fyYear,
  })

  const taxResult = calculateTax(
    grossTaxableIncome,
    taxSlabs,
    standardDeduction,
    hasEmploymentIncome,
    salaryMonthsCount,
    isNewRegime,
    fyYear,
  )

  return {
    fyYear,
    newRegimeAvailable,
    isNewRegime,
    taxSlabs,
    regimeLabel,
    standardDeduction,
    hasEmploymentIncome,
    grossTaxableIncome,
    baseTax: taxResult.tax,
    slabBreakdown: taxResult.slabBreakdown,
    rebate87A: taxResult.rebate87A,
    surcharge: taxResult.surcharge,
    cess: taxResult.cess,
    professionalTax: taxResult.professionalTax,
    taxAlreadyPaid: taxResult.totalTax,
  }
}

export function computePaidTax(
  fy: string,
  fyData: FYData,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
): number {
  const taxableAmt = fyData.taxableIncome > 0 ? fyData.taxableIncome : fyData.income
  const salaryMonths = fyData.salaryMonths?.size || 0
  const computed = computeTaxForFY(fy, taxableAmt, salaryMonths, regimeOverride, preferredRegime)
  return Math.round(computed.taxAlreadyPaid)
}

export function computeProjectedTax(
  hasTxData: boolean,
  projTotal: number,
  paidTax: number,
  fy: string,
  currentFYLabel: string,
): number {
  if (!hasTxData && projTotal > 0) return projTotal
  if (fy === currentFYLabel && projTotal > paidTax) return projTotal - paidTax
  return 0
}

/** Build yearly tax chart data from FY list and projections */
export function buildYearlyTaxData(
  fyList: string[],
  transactionsByFY: Record<string, FYData>,
  multiYearProjections: ProjectedFYBreakdown[],
  currentFYLabel: string,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
): YearlyTaxDatum[] {
  const projectedTaxByFY: Record<string, number> = {}
  for (const p of multiYearProjections) projectedTaxByFY[p.fy] = p.totalTax

  const data = fyList
    .slice()
    .reverse()
    .map((fy) => {
      const bareFY = fy.replace(/^FY\s+/i, '')
      const fyData = transactionsByFY[fy]
      const hasTxData = !!fyData
      const projTotal = Math.round(projectedTaxByFY[bareFY] ?? 0)

      const paidTax = hasTxData ? computePaidTax(fy, fyData, regimeOverride, preferredRegime) : 0
      const projected = computeProjectedTax(hasTxData, projTotal, paidTax, fy, currentFYLabel)

      return { fy, paidTax, projected, cumulative: 0 }
    })

  let cum = 0
  for (const d of data) {
    cum += d.paidTax + d.projected
    d.cumulative = cum
  }
  return data
}

/** Compute the previous FY's display values for YoY comparison badges */
export function computePrevFYDisplay(
  effectiveFY: string,
  currentFYLabel: string,
  transactionsByFY: Record<string, FYData>,
  regimeOverride: TaxRegimeOverride,
  preferredRegime: string,
  hasSalaryData: boolean,
  salaryStructure: Record<string, SalaryComponents>,
  rsuGrants: RsuGrant[],
  growthAssumptions: GrowthAssumptions,
  fiscalYearStartMonth: number,
  isNewRegime: boolean,
): { net: number; gross: number; totalTax: number } | null {
  if (!effectiveFY) return null
  const startYear = parseFYStartYear(effectiveFY)
  if (!startYear) return null
  const prevStart = startYear - 1
  const prevEnd = startYear % 100
  const prevFYLabel = `FY ${prevStart}-${String(prevEnd).padStart(2, '0')}`

  const currentStart = parseFYStartYear(currentFYLabel)
  const prevIsComplete = prevStart < currentStart

  if (prevIsComplete) {
    const prevFYData = transactionsByFY[prevFYLabel]
    if (prevFYData) {
      const prevResult = computeTaxForFY(
        prevFYLabel,
        prevFYData.taxableIncome || 0,
        prevFYData.salaryMonths?.size || 0,
        regimeOverride,
        preferredRegime,
      )
      return {
        net: prevFYData.taxableIncome || 0,
        gross: prevResult.grossTaxableIncome,
        totalTax: prevResult.taxAlreadyPaid,
      }
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
      const prevSlabs = getTaxSlabs(prevStart, isNewRegime ? 'new' : 'old')
      const prevStdDeduction = getStandardDeduction(prevStart)
      const prevTax = calculateTax(
        prevProjection.grossTaxable,
        prevSlabs,
        prevStdDeduction,
        true,
        12,
        isNewRegime,
        prevStart,
      )
      return {
        net: prevProjection.grossTaxable - prevTax.totalTax,
        gross: prevProjection.grossTaxable,
        totalTax: prevTax.totalTax,
      }
    }
  }

  return null
}

export function calculateBreakEvenDeduction(
  grossIncome: number,
  fyYear: number,
  standardDeduction: number,
  salaryMonthsCount: number,
  newRegimeTax: number,
): number {
  for (let d = 0; d <= 1000000; d += 10000) {
    const oldWithDeductions = calculateTax(
      Math.max(0, grossIncome - d),
      getTaxSlabs(fyYear, 'old'),
      standardDeduction,
      true,
      salaryMonthsCount,
      false,
      fyYear,
    )
    if (oldWithDeductions.totalTax <= newRegimeTax) return d
  }
  return 0
}

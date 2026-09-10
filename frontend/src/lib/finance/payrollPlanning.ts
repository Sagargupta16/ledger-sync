import { MONTHS_PER_YEAR } from '@/lib/dateUtils'
import { netSavings, savingsRatePercentFromNet, shareOfIncomePercent } from '@/lib/savingsRate'
import { sumRsuCompensation } from '@/lib/rsuVesting'
import { calculateTax, getStandardDeduction, getTaxSlabs, parseFYStartYear } from '@/lib/taxCalculator'
import { buildTdsSchedule, computeTaxPaidTillDate, type TdsMonthRow } from '@/lib/tdsScheduleCalculator'
import type { ProjectedFYBreakdown, ValuedRsuVesting } from '@/types/salary'
import type { FYData, TaxPlanningResult, TaxRegime } from './taxPlanning'

interface SalaryPayrollInput {
  cashEarnings: number
  cashDeductions: number
  bonus: number
  rsuVestingEvents: ValuedRsuVesting[]
  fyStartYear: number
  fyStartMonth: number
  regime: TaxRegime
}

/** One dated settlement supplies both annual compensation and monthly payroll. */
export function buildSalaryPayroll(input: Readonly<SalaryPayrollInput>) {
  const { cashEarnings, cashDeductions, bonus, fyStartYear, fyStartMonth } = input
  const rsuVestingEvents = input.rsuVestingEvents.filter((event) => event.fyStartYear === fyStartYear)
  const regime = fyStartYear < 2020 ? 'old' : input.regime
  const grossTaxable = cashEarnings + sumRsuCompensation(rsuVestingEvents).grossValue
  const standardDeduction = Math.min(getStandardDeduction(fyStartYear, regime), grossTaxable)
  const slabs = getTaxSlabs(fyStartYear, regime)
  const applyProfessionalTax = grossTaxable > 0
  const taxResult = calculateTax(
    grossTaxable, slabs, standardDeduction, applyProfessionalTax,
    MONTHS_PER_YEAR, regime === 'new', fyStartYear,
  )
  const schedule = buildTdsSchedule({
    regularMonthlyIncome: Math.max(0, cashEarnings - bonus) / MONTHS_PER_YEAR,
    extraByMonth: Object.fromEntries(
      Array.from({ length: MONTHS_PER_YEAR }, (_, index) => [index, bonus / MONTHS_PER_YEAR]),
    ),
    rsuVestingEvents,
    monthlyCashDeductions: cashDeductions / MONTHS_PER_YEAR,
    fyStartMonth, fyStartYear, slabs, standardDeduction, applyProfessionalTax,
    isNewRegime: regime === 'new',
  })
  const summary = summarizePayrollSchedule(schedule)
  const compensation = {
    payrollTax: summary.cashTds,
    cashTakeHome: summary.cashTakeHome,
    netShareValue: summary.netShareValue,
    netCompensation: summary.cashTakeHome + summary.netShareValue,
    excessShareWithholding: schedule.at(-1)?.excessShareWithholding ?? 0,
  }
  return { schedule, compensation, taxResult, standardDeduction, grossTaxable }
}

/** Reuse the tax engine and dated compensation settlement for the selected regime. */
export function applyProjectionTaxRegime(projection: ProjectedFYBreakdown, regime: TaxRegime) {
  const { compensation, taxResult, standardDeduction } = buildSalaryPayroll({
    ...projection,
    fyStartYear: parseFYStartYear(projection.fy),
    regime,
  })
  return {
    projection: {
      ...projection,
      standardDeduction,
      netTaxable: Math.max(0, projection.grossTaxable - standardDeduction),
      totalTax: taxResult.totalTax,
      takeHome: compensation.cashTakeHome,
      ...compensation,
      effectiveTaxRate: shareOfIncomePercent(taxResult.totalTax, projection.grossTaxable),
    },
    taxResult,
  }
}

/** Identified share receipts are never cash bonuses, including later settlements. */
function recordedNetRsuReceipts(data: FYData): number {
  return Object.values(data.incomeGroups).flatMap((group) => group.transactions)
    .filter((tx) => tx.category === 'Employment Income'
      && /^rsus?$/i.test(tx.subcategory ?? ''))
    .reduce((total, tx) => total + tx.amount, 0)
}

function recordedSalaryMonths(data: FYData | null, fyYear: number, fyStartMonth: number): number[] {
  return [...(data?.salaryMonths ?? [])].map((key) => {
    const [year, month] = key.split('-').map(Number)
    return (year - fyYear) * MONTHS_PER_YEAR + month - fyStartMonth
  }).filter((index) => index >= 0 && index < MONTHS_PER_YEAR)
}

interface PayrollPlanningInput {
  projection: ProjectedFYBreakdown | null
  tax: TaxPlanningResult
  fyData: FYData | null
  fyStartMonth: number
  isCurrentFY: boolean
  useSalaryProjection: boolean
}

/**
 * Annual projection, dated shares, and cash-only bonus extras share one model.
 * Recorded-income estimates remain separate from projected monthly rows.
 */
export function buildPayrollPlanning({
  projection, tax, fyData, fyStartMonth, isCurrentFY, useSalaryProjection,
}: Readonly<PayrollPlanningInput>) {
  const paidMonthIndices = recordedSalaryMonths(fyData, tax.fyYear, fyStartMonth)
  if (!projection) return { schedule: [], paidMonthIndices, paidEstimate: null }

  const baseAnnual = Math.max(0, projection.cashEarnings - projection.bonus)
  const { schedule, standardDeduction } = buildSalaryPayroll({
    ...projection,
    fyStartMonth,
    fyStartYear: tax.fyYear,
    regime: tax.selectedRegime,
  })
  const shared = {
    slabs: tax.taxSlabs,
    standardDeduction,
    isNewRegime: tax.isNewRegime,
    fyStartYear: tax.fyYear,
    rsuVestingEvents: projection.rsuVestingEvents,
    monthlyCashDeductions: projection.cashDeductions / MONTHS_PER_YEAR,
  }
  const canEstimatePaid = isCurrentFY && !useSalaryProjection && tax.incomeBasis === 'net'
    && fyData !== null && paidMonthIndices.length > 0
  const paidEstimate = canEstimatePaid ? computeTaxPaidTillDate({
    ...shared,
    baseAnnual,
    monthsPaid: paidMonthIndices.length,
    receivedNet: fyData.employmentTaxableIncome,
    rsuNetIncludedInReceivedNet: recordedNetRsuReceipts(fyData),
  }) : null

  return { schedule, paidMonthIndices, paidEstimate }
}

export function summarizePayrollSchedule(schedule: readonly TdsMonthRow[]) {
  return schedule.reduce((totals, row) => ({
    totalTax: totals.totalTax + row.monthlyTds,
    cashTds: totals.cashTds + row.cashTds,
    shareWithholding: totals.shareWithholding + row.rsuWithholding,
    cashTakeHome: totals.cashTakeHome + row.cashTakeHome,
    netShareValue: totals.netShareValue + row.netShareValue,
  }), { totalTax: 0, cashTds: 0, shareWithholding: 0, cashTakeHome: 0, netShareValue: 0 })
}

/** Display ratios retain the same numerators as their corresponding totals. */
export function taxOverviewMetrics(gross: number, totalTax: number, income: number, outflows: number) {
  const net = netSavings({ income, expense: outflows })
  return {
    effectiveTaxRate: shareOfIncomePercent(totalTax, gross),
    netSavings: net,
    savingsRate: savingsRatePercentFromNet(net, income) ?? 0,
  }
}

/** The cards, slab table and regime comparison consume the same tax result. */
export function taxPlanningDisplay(
  tax: TaxPlanningResult,
  projected: ReturnType<typeof applyProjectionTaxRegime> | null,
  recordedIncome: number,
  annualTax?: TaxPlanningResult | null,
) {
  if (projected) {
    const { projection, taxResult } = projected
    return {
      gross: annualTax?.grossTaxableIncome ?? projection.grossTaxable,
      net: projection.cashTakeHome,
      totalTax: annualTax?.totalTax ?? taxResult.totalTax,
      baseTax: annualTax?.baseTax ?? taxResult.tax,
      cess: annualTax?.cess ?? taxResult.cess,
      professionalTax: annualTax?.professionalTax ?? taxResult.professionalTax,
      slabBreakdown: annualTax?.slabBreakdown ?? taxResult.slabBreakdown,
      rebate87A: annualTax?.rebate87A ?? taxResult.rebate87A,
      surcharge: annualTax?.surcharge ?? taxResult.surcharge,
      income: annualTax?.grossTaxableIncome ?? projection.grossTaxable,
    }
  }
  return {
    gross: tax.grossTaxableIncome,
    net: tax.netAfterCashDeductions,
    totalTax: tax.totalTax,
    baseTax: tax.baseTax,
    cess: tax.cess,
    professionalTax: tax.professionalTax,
    slabBreakdown: tax.slabBreakdown,
    rebate87A: tax.rebate87A,
    surcharge: tax.surcharge,
    income: recordedIncome,
  }
}

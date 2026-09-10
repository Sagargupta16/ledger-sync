/**
 * Pure projection functions for multi-year tax planning.
 *
 * Takes salary structure + growth assumptions and produces per-FY
 * tax breakdowns using calculateTax() from taxCalculator.ts.
 */

import { parseFYStartYear as parseFYStart } from '@/lib/taxCalculator'
import { MONTHS_PER_YEAR } from '@/lib/dateUtils'
import { sumRsuCompensation, todayKey, valueRsuVestings } from '@/lib/rsuVesting'
import { salaryCashEarnings } from '@/lib/salaryCompensation'
import { shareOfIncomePercent } from '@/lib/savingsRate'
import { buildSalaryPayroll } from '@/lib/finance/payrollPlanning'
import type {
  GrowthAssumptions,
  ProjectedFYBreakdown,
  RsuGrant,
  SalaryComponents,
  ValuedRsuVesting,
} from '@/types/salary'

/** Last two digits of a year: 2025 -> "25", 2100 -> "00", 2099 -> "99". */
function twoDigitYear(year: number): string {
  return String(year % 100).padStart(2, '0')
}

/** Increment a FY string by N years: "2025-26" + 1 -> "2026-27" */
function offsetFY(fy: string, offset: number): string {
  const startYear = parseFYStart(fy) + offset
  return `${startYear}-${twoDigitYear(startYear + 1)}`
}

/** Safely coerce a value (possibly string from JSON) to number. */
function N(v: number | string | null | undefined): number {
  return Number(v) || 0
}

interface RsuFYData {
  shares: number
  value: number
  details: Array<{ stock_name: string; shares: number; value: number }>
}

/** Group RSU vestings by fiscal year with optional stock appreciation.
 *
 * Vested rows (date <= today) are realized income: they use the locked
 * vest-date price when available and never get appreciation applied.
 * Upcoming rows are projections: current price grown by the appreciation
 * assumption for the years between the base FY and the vesting FY.
 */
export function getRsuVestingsByFY(
  grants: RsuGrant[],
  fyStartMonth: number,
  stockAppreciationPct: number,
  baseStartYear?: number,
  today: string = todayKey(),
): Record<string, RsuFYData> {
  return groupRsuVestingsByFY(valueRsuVestings(grants, {
    fyStartMonth,
    stockAppreciationPct,
    baseStartYear,
    today,
  }))
}

function groupRsuVestingsByFY(events: ValuedRsuVesting[]): Record<string, RsuFYData> {
  const result: Record<string, RsuFYData> = {}

  for (const event of events) {
    const bucket = result[event.fy] ??= { shares: 0, value: 0, details: [] }
    bucket.shares += event.grossQuantity
    bucket.value += event.grossValue
    const existing = bucket.details.find((detail) => detail.stock_name === event.stockName)
    if (existing) {
      existing.shares += event.grossQuantity
      existing.value += event.grossValue
    } else {
      bucket.details.push({
        stock_name: event.stockName,
        shares: event.grossQuantity,
        value: event.grossValue,
      })
    }
  }

  return result
}

/** Missing mode preserves saved behavior; explicit recurring permits flat bonuses. */
export function projectAnnualBonus(
  annualBonus: number,
  yearsOffset: number,
  growth: Pick<GrowthAssumptions, 'bonus_growth_pct' | 'bonus_mode'>,
): number {
  if (yearsOffset === 0) return annualBonus
  const recurring = growth.bonus_mode === 'recurring'
    || (growth.bonus_mode == null && growth.bonus_growth_pct !== 0)
  return recurring ? annualBonus * Math.pow(1 + growth.bonus_growth_pct / 100, yearsOffset) : 0
}

/** Project a single fiscal year's income and tax breakdown. */
export function projectFiscalYear(
  targetFY: string,
  salaryStructure: Record<string, SalaryComponents>,
  rsuGrants: RsuGrant[],
  growth: GrowthAssumptions,
  fyStartMonth: number,
): ProjectedFYBreakdown {
  const sortedFYs = Object.keys(salaryStructure).sort((a, b) => a.localeCompare(b))
  const baseFY =
    sortedFYs.findLast((fy) => fy <= targetFY) ?? sortedFYs[0]
  if (!baseFY || !salaryStructure[baseFY]) {
    return emptyBreakdown(targetFY, fyStartMonth)
  }

  const base = salaryStructure[baseFY]
  const isExplicit = targetFY in salaryStructure
  const yearsOffset = parseFYStart(targetFY) - parseFYStart(baseFY)

  const baseGrowthFactor = Math.pow(
    1 + growth.base_salary_growth_pct / 100,
    yearsOffset,
  )

  const baseSalaryAnnual = isExplicit
    ? N(salaryStructure[targetFY].base_salary_annual)
    : N(base.base_salary_annual) * baseGrowthFactor

  const hraAnnual = (() => {
    const src = isExplicit ? salaryStructure[targetFY] : base
    if (src.hra_annual == null) return 0
    return isExplicit ? N(src.hra_annual) : N(src.hra_annual) * baseGrowthFactor
  })()

  const bonusAnnual = isExplicit
    ? N(salaryStructure[targetFY].bonus_annual)
    : projectAnnualBonus(N(base.bonus_annual), yearsOffset, growth)

  const epfAnnual = (() => {
    if (isExplicit) return N(salaryStructure[targetFY].epf_monthly) * MONTHS_PER_YEAR
    if (growth.epf_scales_with_base)
      return N(base.epf_monthly) * baseGrowthFactor * MONTHS_PER_YEAR
    return N(base.epf_monthly) * MONTHS_PER_YEAR
  })()

  const npsAnnual = (() => {
    if (isExplicit) return N(salaryStructure[targetFY].nps_monthly) * MONTHS_PER_YEAR
    const npsFactor = Math.pow(1 + growth.nps_growth_pct / 100, yearsOffset)
    return N(base.nps_monthly) * npsFactor * MONTHS_PER_YEAR
  })()

  const specialAllowanceAnnual = isExplicit
    ? N(salaryStructure[targetFY].special_allowance_annual)
    : N(base.special_allowance_annual)

  const otherTaxableAnnual = isExplicit
    ? N(salaryStructure[targetFY].other_taxable_annual)
    : N(base.other_taxable_annual)

  const baseStartYear = parseFYStart(baseFY)
  const rsuVestingEvents = valueRsuVestings(rsuGrants, {
    fyStartMonth,
    stockAppreciationPct: growth.stock_price_appreciation_pct,
    baseStartYear,
  }).filter((event) => event.fy === targetFY)
  const rsuByFY = groupRsuVestingsByFY(rsuVestingEvents)
  const rsuData = rsuByFY[targetFY] ?? { shares: 0, value: 0, details: [] }
  const rsuCompensation = sumRsuCompensation(rsuVestingEvents)

  const cashEarnings = salaryCashEarnings({
    base_salary_annual: baseSalaryAnnual,
    hra_annual: hraAnnual,
    bonus_annual: bonusAnnual,
    special_allowance_annual: specialAllowanceAnnual,
    other_taxable_annual: otherTaxableAnnual,
  }).annual
  const { grossTaxable, standardDeduction, taxResult, compensation } = buildSalaryPayroll({
    cashEarnings,
    cashDeductions: epfAnnual,
    bonus: bonusAnnual,
    rsuVestingEvents,
    fyStartYear: parseFYStart(targetFY),
    fyStartMonth,
    regime: 'new',
  })
  const netTaxable = Math.max(0, grossTaxable - standardDeduction)
  const effectiveTaxRate = shareOfIncomePercent(taxResult.totalTax, grossTaxable)

  return {
    fy: targetFY,
    fyStartMonth,
    baseSalary: baseSalaryAnnual,
    hra: hraAnnual,
    bonus: bonusAnnual,
    epf: epfAnnual,
    nps: npsAnnual,
    specialAllowance: specialAllowanceAnnual,
    otherTaxable: otherTaxableAnnual,
    rsuIncome: rsuData.value,
    rsuDetails: rsuData.details,
    rsuVestingEvents,
    cashEarnings,
    cashDeductions: epfAnnual,
    grossTaxable,
    standardDeduction,
    netTaxable,
    totalTax: taxResult.totalTax,
    takeHome: compensation.cashTakeHome,
    ...compensation,
    rsuWithholding: rsuCompensation.withholdingValue,
    rsuRecordedWithholding: rsuCompensation.recordedWithholding,
    rsuEstimatedWithholding: rsuCompensation.estimatedWithholding,
    effectiveTaxRate,
    isProjected: !isExplicit || yearsOffset > 0,
  }
}

/** Project multiple years starting from the latest FY with explicit salary data. */
export function projectMultipleYears(
  salaryStructure: Record<string, SalaryComponents>,
  rsuGrants: RsuGrant[],
  growth: GrowthAssumptions,
  fyStartMonth: number,
): ProjectedFYBreakdown[] {
  const sortedFYs = Object.keys(salaryStructure).sort((a, b) => a.localeCompare(b))
  if (sortedFYs.length === 0) return []

  const latestFY = sortedFYs.at(-1)!
  const results: ProjectedFYBreakdown[] = []

  for (let i = 0; i <= growth.projection_years; i++) {
    const targetFY = offsetFY(latestFY, i)
    results.push(
      projectFiscalYear(targetFY, salaryStructure, rsuGrants, growth, fyStartMonth),
    )
  }

  return results
}

function emptyBreakdown(fy: string, fyStartMonth: number): ProjectedFYBreakdown {
  return {
    fy,
    fyStartMonth,
    baseSalary: 0,
    hra: 0,
    bonus: 0,
    epf: 0,
    nps: 0,
    specialAllowance: 0,
    otherTaxable: 0,
    rsuIncome: 0,
    rsuDetails: [],
    rsuVestingEvents: [],
    cashEarnings: 0,
    cashDeductions: 0,
    grossTaxable: 0,
    standardDeduction: 0,
    netTaxable: 0,
    totalTax: 0,
    takeHome: 0,
    cashTakeHome: 0,
    netShareValue: 0,
    netCompensation: 0,
    payrollTax: 0,
    rsuWithholding: 0,
    rsuRecordedWithholding: 0,
    rsuEstimatedWithholding: 0,
    excessShareWithholding: 0,
    effectiveTaxRate: 0,
    isProjected: true,
  }
}

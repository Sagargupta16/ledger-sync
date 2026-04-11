/**
 * Pure projection functions for multi-year tax planning.
 *
 * Takes salary structure + growth assumptions and produces per-FY
 * tax breakdowns using calculateTax() from taxCalculator.ts.
 */

import {
  calculateTax,
  getStandardDeduction,
  getTaxSlabs,
} from '@/lib/taxCalculator'
import type {
  GrowthAssumptions,
  ProjectedFYBreakdown,
  RsuGrant,
  SalaryComponents,
} from '@/types/salary'

/**
 * Parse the numeric start year from an FY string.
 * Handles both "2025-26" and "FY 2025-26" formats.
 */
function parseFYStart(fy: string): number {
  const stripped = fy.replace(/^FY\s+/i, '')
  return Number.parseInt(stripped.split('-')[0], 10)
}

/** Increment a FY string by N years: "2025-26" + 1 -> "2026-27" */
function offsetFY(fy: string, offset: number): string {
  const startYear = parseFYStart(fy) + offset
  const endYear = (startYear + 1) % 100
  return `${startYear}-${String(endYear).padStart(2, '0')}`
}

/** Get the FY string a date falls into given a fiscal year start month. */
function dateToFY(dateStr: string, fyStartMonth: number): string {
  const d = new Date(dateStr)
  const month = d.getMonth() + 1
  const year = d.getFullYear()
  const fyStartYear = month >= fyStartMonth ? year : year - 1
  const endYear = (fyStartYear + 1) % 100
  return `${fyStartYear}-${String(endYear).padStart(2, '0')}`
}

interface RsuFYData {
  shares: number
  value: number
  details: Array<{ stock_name: string; shares: number; value: number }>
}

/** Group RSU vestings by fiscal year with optional stock appreciation. */
export function getRsuVestingsByFY(
  grants: RsuGrant[],
  fyStartMonth: number,
  stockAppreciationPct: number,
  baseStartYear?: number,
): Record<string, RsuFYData> {
  const result: Record<string, RsuFYData> = {}

  for (const grant of grants) {
    for (const vesting of grant.vestings) {
      const fy = dateToFY(vesting.date, fyStartMonth)
      const fyStart = parseFYStart(fy)
      const yearsFromBase =
        baseStartYear != null ? fyStart - baseStartYear : 0
      const appreciationFactor = Math.pow(
        1 + stockAppreciationPct / 100,
        Math.max(0, yearsFromBase),
      )
      const adjustedPrice = grant.stock_price * appreciationFactor
      const vestingValue = vesting.quantity * adjustedPrice

      if (!result[fy]) {
        result[fy] = { shares: 0, value: 0, details: [] }
      }
      result[fy].shares += vesting.quantity
      result[fy].value += vestingValue

      const existing = result[fy].details.find(
        (d) => d.stock_name === grant.stock_name,
      )
      if (existing) {
        existing.shares += vesting.quantity
        existing.value += vestingValue
      } else {
        result[fy].details.push({
          stock_name: grant.stock_name,
          shares: vesting.quantity,
          value: vestingValue,
        })
      }
    }
  }

  return result
}

/** Project a single fiscal year's income and tax breakdown. */
export function projectFiscalYear(
  targetFY: string,
  salaryStructure: Record<string, SalaryComponents>,
  rsuGrants: RsuGrant[],
  growth: GrowthAssumptions,
  fyStartMonth: number,
): ProjectedFYBreakdown {
  const sortedFYs = Object.keys(salaryStructure).sort()
  const baseFY =
    sortedFYs.filter((fy) => fy <= targetFY).at(-1) ?? sortedFYs[0]
  if (!baseFY || !salaryStructure[baseFY]) {
    return emptyBreakdown(targetFY)
  }

  const base = salaryStructure[baseFY]
  const isExplicit = targetFY in salaryStructure
  const yearsOffset = parseFYStart(targetFY) - parseFYStart(baseFY)

  const baseGrowthFactor = Math.pow(
    1 + growth.base_salary_growth_pct / 100,
    yearsOffset,
  )

  const baseSalaryAnnual =
    (isExplicit
      ? salaryStructure[targetFY].base_salary_monthly
      : base.base_salary_monthly * baseGrowthFactor) * 12

  const hraAnnual = (() => {
    const src = isExplicit ? salaryStructure[targetFY] : base
    if (src.hra_monthly == null) return 0
    return (isExplicit ? src.hra_monthly : src.hra_monthly * baseGrowthFactor) * 12
  })()

  const bonusAnnual = (() => {
    if (isExplicit) return salaryStructure[targetFY].bonus_annual
    if (yearsOffset === 0) return base.bonus_annual
    if (growth.bonus_growth_pct === 0) return 0
    return (
      base.bonus_annual *
      Math.pow(1 + growth.bonus_growth_pct / 100, yearsOffset)
    )
  })()

  const epfAnnual = (() => {
    if (isExplicit) return salaryStructure[targetFY].epf_monthly * 12
    if (growth.epf_scales_with_base)
      return base.epf_monthly * baseGrowthFactor * 12
    return base.epf_monthly * 12
  })()

  const npsAnnual = (() => {
    if (isExplicit) return salaryStructure[targetFY].nps_monthly * 12
    const npsFactor = Math.pow(1 + growth.nps_growth_pct / 100, yearsOffset)
    return base.nps_monthly * npsFactor * 12
  })()

  const specialAllowanceAnnual = isExplicit
    ? salaryStructure[targetFY].special_allowance_annual
    : base.special_allowance_annual

  const otherTaxableAnnual = isExplicit
    ? salaryStructure[targetFY].other_taxable_annual
    : base.other_taxable_annual

  const baseStartYear = parseFYStart(baseFY)
  const rsuByFY = getRsuVestingsByFY(
    rsuGrants,
    fyStartMonth,
    growth.stock_price_appreciation_pct,
    baseStartYear,
  )
  const rsuData = rsuByFY[targetFY] ?? { shares: 0, value: 0, details: [] }

  const grossTaxable =
    baseSalaryAnnual +
    hraAnnual +
    bonusAnnual +
    specialAllowanceAnnual +
    otherTaxableAnnual +
    rsuData.value -
    epfAnnual

  const fyStartYear = parseFYStart(targetFY)
  const standardDeduction = getStandardDeduction(fyStartYear)
  const netTaxable = Math.max(0, grossTaxable - standardDeduction)

  const slabs = getTaxSlabs(fyStartYear, 'new')
  const taxResult = calculateTax(
    grossTaxable,
    slabs,
    standardDeduction,
    true,
    12,
    true,
    fyStartYear,
  )

  const takeHome = grossTaxable - taxResult.totalTax
  const effectiveTaxRate =
    grossTaxable > 0 ? (taxResult.totalTax / grossTaxable) * 100 : 0

  return {
    fy: targetFY,
    baseSalary: baseSalaryAnnual,
    hra: hraAnnual,
    bonus: bonusAnnual,
    epf: epfAnnual,
    nps: npsAnnual,
    specialAllowance: specialAllowanceAnnual,
    otherTaxable: otherTaxableAnnual,
    rsuIncome: rsuData.value,
    rsuDetails: rsuData.details,
    grossTaxable,
    standardDeduction,
    netTaxable,
    totalTax: taxResult.totalTax,
    takeHome,
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
  const sortedFYs = Object.keys(salaryStructure).sort()
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

function emptyBreakdown(fy: string): ProjectedFYBreakdown {
  return {
    fy,
    baseSalary: 0,
    hra: 0,
    bonus: 0,
    epf: 0,
    nps: 0,
    specialAllowance: 0,
    otherTaxable: 0,
    rsuIncome: 0,
    rsuDetails: [],
    grossTaxable: 0,
    standardDeduction: 0,
    netTaxable: 0,
    totalTax: 0,
    takeHome: 0,
    effectiveTaxRate: 0,
    isProjected: true,
  }
}

/**
 * Tax Calculator - Pure functions for Indian income tax calculations
 *
 * Supports both old and new tax regimes with slab-based calculation,
 * standard deduction, health & education cess, and professional tax.
 *
 * All year-specific rates (slabs, surcharge, 87A rebate, standard
 * deduction, cess, professional tax) live in `tax-config/` and are
 * looked up per FY via `getTaxConfig(fyStartYear)`. To apply a new
 * Budget, add a new FY entry there, not here.
 */

/** Default fiscal year start month (April, 1-indexed) */
export const FY_START_MONTH = 4

/** Maximum months for professional tax */
const MAX_PROFESSIONAL_TAX_MONTHS = 12

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface TaxSlab {
  lower: number
  upper: number
  rate: number
}

export interface SlabBreakdownEntry {
  slab: TaxSlab
  taxAmount: number
}

export interface TaxCalculationResult {
  tax: number
  slabBreakdown: SlabBreakdownEntry[]
  rebate87A: number
  surcharge: number
  cess: number
  professionalTax: number
  totalTax: number
}

// ────────────────────────────────────────────
// Tax Slab Definitions — sourced from tax-config/
// ────────────────────────────────────────────

import { getTaxConfig } from './tax-config'

/**
 * OLD TAX REGIME (with Section 80C, HRA, LTA deductions).
 * Kept as an exported alias for the *current* old-regime slabs so
 * existing imports keep working. The slabs themselves live in
 * tax-config/ — this re-export freezes them at the current FY.
 */
export const TAX_SLABS_OLD_REGIME: TaxSlab[] = getTaxConfig(
  new Date().getUTCFullYear(),
).oldRegime.slabs

/** NEW TAX REGIME — FY 2024-25 (Budget 2024 revision) */
export const TAX_SLABS_NEW_FY2024: TaxSlab[] = getTaxConfig(2024).newRegime.slabs

/** NEW TAX REGIME — FY 2025-26 onwards (Budget 2025 revision) */
export const TAX_SLABS_NEW_FY2025: TaxSlab[] = getTaxConfig(2025).newRegime.slabs

// Backward-compatible aliases
export const TAX_SLABS_OLD = TAX_SLABS_NEW_FY2024
export const TAX_SLABS_NEW = TAX_SLABS_NEW_FY2025

/** Old-regime slabs for the given FY. */
export function getOldRegimeSlabs(fyStartYear: number = new Date().getUTCFullYear()): TaxSlab[] {
  return getTaxConfig(fyStartYear).oldRegime.slabs
}

/** New-regime slabs for the given FY. */
export function getNewRegimeSlabs(fyStartYear: number): TaxSlab[] {
  return getTaxConfig(fyStartYear).newRegime.slabs
}

/** Dispatch slabs by regime + FY. */
export function getTaxSlabs(
  fyStartYear: number,
  regime: 'new' | 'old',
): TaxSlab[] {
  return regime === 'old'
    ? getOldRegimeSlabs(fyStartYear)
    : getNewRegimeSlabs(fyStartYear)
}

// ────────────────────────────────────────────
// Tax Calculation Functions
// ────────────────────────────────────────────

// ────────────────────────────────────────────
// Surcharge rates (applicable on base tax)
// ────────────────────────────────────────────

/** Sum slab tax for a given taxable income (no surcharge/cess/rebate). */
function computeBaseTax(taxableIncome: number, slabs: TaxSlab[]): number {
  let tax = 0
  for (const slab of slabs) {
    if (taxableIncome > slab.lower) {
      tax += (Math.min(taxableIncome, slab.upper) - slab.lower) * (slab.rate / 100)
    }
  }
  return tax
}

function computeSurcharge(
  taxableIncome: number,
  baseTax: number,
  isNewRegime: boolean,
  fyStartYear: number,
  slabs: TaxSlab[],
): number {
  const cfg = getTaxConfig(fyStartYear)
  const rates = isNewRegime ? cfg.newRegime.surcharge : cfg.oldRegime.surcharge
  // rates are ordered high->low threshold; the first crossed is the highest
  // applicable tier. The NEXT entry (lower threshold) is the previous tier.
  const tierIdx = rates.findIndex((t) => taxableIncome > t.above)
  if (tierIdx < 0) return 0

  const tier = rates[tierIdx]
  const surcharge = baseTax * tier.rate

  // Marginal relief: total tax (base + surcharge) on income just above a
  // threshold cannot exceed [tax payable AT the threshold] + [income above it].
  // The tax at the threshold already includes the surcharge of the PREVIOUS
  // (lower) tier (e.g. at exactly 1Cr the 50L-1Cr rate still applies), so use
  // that rate, not zero. Without this cap a few rupees over a threshold trigger
  // lakhs of extra tax.
  const prevRate = tierIdx + 1 < rates.length ? rates[tierIdx + 1].rate : 0
  const taxAtThreshold = computeBaseTax(tier.above, slabs)
  const totalAtThreshold = taxAtThreshold * (1 + prevRate)
  const incomeAboveThreshold = taxableIncome - tier.above
  const reliefCappedSurcharge = totalAtThreshold + incomeAboveThreshold - baseTax
  return Math.max(0, Math.min(surcharge, reliefCappedSurcharge))
}

// ────────────────────────────────────────────
// Section 87A Rebate
// ────────────────────────────────────────────

interface RebateConfig {
  maxIncome: number
  maxRebate: number
}

function getRebateConfig(
  isNewRegime: boolean,
  fyStartYear: number,
): RebateConfig {
  const cfg = getTaxConfig(fyStartYear)
  return isNewRegime ? cfg.newRegime.rebate87A : cfg.oldRegime.rebate87A
}

// ────────────────────────────────────────────
// Main Tax Calculation
// ────────────────────────────────────────────

/**
 * Calculate income tax with surcharge, Section 87A rebate,
 * 4% Health & Education Cess, and professional tax.
 */
export function calculateTax(
  income: number,
  slabs: TaxSlab[],
  standardDeduction: number = 0,
  applyProfessionalTax: boolean = true,
  salaryMonthsCount: number = 12,
  isNewRegime: boolean = true,
  fyStartYear: number = 2025,
): TaxCalculationResult {
  const taxableIncome = Math.max(0, income - standardDeduction)

  // 1. Compute base tax from slabs
  let baseTax = 0
  const slabBreakdown: SlabBreakdownEntry[] = []

  for (const slab of slabs) {
    if (taxableIncome > slab.lower) {
      const taxableInSlab = Math.min(taxableIncome, slab.upper) - slab.lower
      const taxAmount = (taxableInSlab * slab.rate) / 100
      baseTax += taxAmount
      slabBreakdown.push({ slab, taxAmount })
    }
  }

  // Indian tax order of operations:
  //   1. Compute base tax from slabs
  //   2. Apply surcharge on base tax (if income crosses thresholds)
  //   3. Apply Section 87A rebate on base tax (not on surcharge)
  //   4. Add 4% Health & Education Cess on (tax after rebate + surcharge)
  //   5. Add professional tax (flat, outside slab math)
  //
  // NOTE: Surcharge is computed on BASE TAX, before rebate. In current
  // Indian tax policy the 87A rebate ceiling (<=12L new / <=5L old) sits
  // far below any surcharge threshold (>=50L), so the two don't overlap
  // today -- but the formula is written correctly so future rule changes
  // won't silently undercount.

  const fyConfig = getTaxConfig(fyStartYear)

  // 2. Surcharge on base tax (with marginal relief at the thresholds)
  const surcharge = computeSurcharge(taxableIncome, baseTax, isNewRegime, fyStartYear, slabs)

  // 3. Section 87A rebate on base tax
  const rebateConfig = getRebateConfig(isNewRegime, fyStartYear)
  let rebate87A = 0
  if (taxableIncome <= rebateConfig.maxIncome) {
    rebate87A = Math.min(baseTax, rebateConfig.maxRebate)
  } else {
    // Marginal relief on 87A (Budget 2025, new regime): just above the rebate
    // ceiling, total tax cannot exceed the income earned above the ceiling.
    // Without this the rebate drops to 0 at the cliff, over-taxing by tens of
    // thousands for incomes a few rupees over the ceiling.
    const incomeAboveCeiling = taxableIncome - rebateConfig.maxIncome
    if (baseTax > incomeAboveCeiling) {
      rebate87A = baseTax - incomeAboveCeiling
    }
  }
  const taxAfterRebate = Math.max(0, baseTax - rebate87A)

  // 4. Health & Education Cess (on tax-after-rebate + surcharge)
  const cess = (taxAfterRebate + surcharge) * fyConfig.cessRate

  // 5. Professional Tax
  const professionalTax = applyProfessionalTax
    ? fyConfig.professionalTaxPerMonth
      * Math.min(salaryMonthsCount, MAX_PROFESSIONAL_TAX_MONTHS)
    : 0

  const totalTax = taxAfterRebate + surcharge + cess + professionalTax

  return {
    tax: baseTax,
    slabBreakdown,
    rebate87A,
    surcharge,
    cess,
    professionalTax,
    totalTax,
  }
}

export interface GrossFromNetOptions {
  slabs: TaxSlab[]
  standardDeduction?: number
  applyProfessionalTax?: boolean
  salaryMonthsCount?: number
  maxIterations?: number
  isNewRegime?: boolean
  fyStartYear?: number
}

/**
 * Reverse-calculate gross income from net income (after tax).
 *
 * `net(gross) = gross - totalTax(gross)` is monotonically increasing in gross,
 * so we bisect on gross. Bisection converges reliably even across the surcharge
 * thresholds where the marginal slope is steep (the old fixed-point iteration
 * could stall there and silently return a non-converged value).
 */
export function calculateGrossFromNet(
  netIncome: number,
  options: GrossFromNetOptions,
): number {
  if (netIncome <= 0) return 0

  const {
    slabs,
    standardDeduction = 0,
    applyProfessionalTax = true,
    salaryMonthsCount = 12,
    maxIterations = 60,
    isNewRegime = true,
    fyStartYear = 2025,
  } = options

  const netFor = (gross: number): number => {
    const { totalTax } = calculateTax(
      gross,
      slabs,
      standardDeduction,
      applyProfessionalTax,
      salaryMonthsCount,
      isNewRegime,
      fyStartYear,
    )
    return gross - totalTax
  }

  // Bracket: net <= gross always, so gross is at least netIncome. Grow the
  // upper bound until its net exceeds the target.
  let lo = netIncome
  let hi = netIncome * 2 + 1
  while (netFor(hi) < netIncome) {
    hi *= 2
  }

  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2
    const calculatedNet = netFor(mid)
    if (Math.abs(calculatedNet - netIncome) < 1) {
      return mid
    }
    if (calculatedNet < netIncome) {
      lo = mid
    } else {
      hi = mid
    }
  }

  return (lo + hi) / 2
}

// ────────────────────────────────────────────
// Fiscal Year Helpers
// ────────────────────────────────────────────

/**
 * Derive the FY label (e.g. "FY 2025-26") from a date string.
 *
 * @param date  ISO date string (YYYY-MM-DD)
 * @param fiscalYearStartMonth  1-indexed month when FY begins (default 4 = April)
 */
export function getFYFromDate(
  date: string,
  fiscalYearStartMonth: number = FY_START_MONTH,
): string {
  // Parse the YYYY-MM-DD components directly. `new Date('2025-04-01')` parses
  // as UTC midnight but getFullYear()/getMonth() return LOCAL components, so a
  // 1st-of-month date can read as the previous month (wrong FY) for negative-
  // offset users. Reading the string avoids any timezone dependence.
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  let year: number
  let month: number
  if (isoMatch) {
    year = Number(isoMatch[1])
    month = Number(isoMatch[2]) // 1-indexed
  } else {
    const d = new Date(date)
    year = d.getUTCFullYear()
    month = d.getUTCMonth() + 1
  }

  if (month >= fiscalYearStartMonth) {
    return `FY ${year}-${(year + 1).toString().slice(-2)}`
  }
  return `FY ${year - 1}-${year.toString().slice(-2)}`
}

/**
 * Get the tax slabs applicable for a given FY start year.
 *
 * FY 2025-26 onward uses the new regime; earlier years use the old one.
 */
export function getTaxSlabsForFY(fyStartYear: number): TaxSlab[] {
  return fyStartYear >= 2025 ? TAX_SLABS_NEW : TAX_SLABS_OLD
}

/**
 * Get the standard deduction amount for a given FY (new regime).
 * Sourced from tax-config so a Budget change is a one-line edit.
 */
export function getStandardDeduction(fyStartYear: number): number {
  return getTaxConfig(fyStartYear).newRegime.standardDeduction
}

/**
 * Parse the numeric start year from an FY label like "FY 2025-26".
 */
export function parseFYStartYear(fyLabel: string): number {
  return Number.parseInt(fyLabel.split(' ')[1]?.split('-')[0] || '0', 10)
}

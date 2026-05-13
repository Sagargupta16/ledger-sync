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

function computeSurcharge(
  taxableIncome: number,
  baseTax: number,
  isNewRegime: boolean,
  fyStartYear: number,
): number {
  const cfg = getTaxConfig(fyStartYear)
  const rates = isNewRegime ? cfg.newRegime.surcharge : cfg.oldRegime.surcharge
  for (const { above, rate } of rates) {
    if (taxableIncome > above) return baseTax * rate
  }
  return 0
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

  // 2. Surcharge on base tax
  const surcharge = computeSurcharge(taxableIncome, baseTax, isNewRegime, fyStartYear)

  // 3. Section 87A rebate on base tax
  const rebateConfig = getRebateConfig(isNewRegime, fyStartYear)
  let rebate87A = 0
  if (taxableIncome <= rebateConfig.maxIncome) {
    rebate87A = Math.min(baseTax, rebateConfig.maxRebate)
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
 * Uses an iterative approach converging within `maxIterations` rounds,
 * stopping when the error is less than Rs 1.
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
    maxIterations = 10,
    isNewRegime = true,
    fyStartYear = 2025,
  } = options

  let grossIncome = netIncome

  for (let i = 0; i < maxIterations; i++) {
    const { totalTax } = calculateTax(
      grossIncome,
      slabs,
      standardDeduction,
      applyProfessionalTax,
      salaryMonthsCount,
      isNewRegime,
      fyStartYear,
    )
    const calculatedNet = grossIncome - totalTax

    if (Math.abs(calculatedNet - netIncome) < 1) {
      return grossIncome
    }

    const diff = netIncome - calculatedNet
    grossIncome += diff
  }

  return grossIncome
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
  const d = new Date(date)
  const year = d.getFullYear()
  const month = d.getMonth() + 1 // 1-indexed

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

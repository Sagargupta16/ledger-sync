/**
 * Tax Calculator - Pure functions for Indian income tax calculations
 *
 * Supports both old and new tax regimes with slab-based calculation,
 * standard deduction, health & education cess, and professional tax.
 */

/** Default fiscal year start month (April, 1-indexed) */
export const FY_START_MONTH = 4

/** Cess rate applied on top of base tax */
const CESS_RATE = 0.04

/** Monthly professional tax amount */
const PROFESSIONAL_TAX_PER_MONTH = 200

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
// Tax Slab Definitions
// ────────────────────────────────────────────

/**
 * OLD TAX REGIME (with Section 80C, HRA, LTA deductions)
 * Same slabs for all financial years.
 */
export const TAX_SLABS_OLD_REGIME: TaxSlab[] = [
  { lower: 0, upper: 250000, rate: 0 },
  { lower: 250000, upper: 500000, rate: 5 },
  { lower: 500000, upper: 1000000, rate: 20 },
  { lower: 1000000, upper: Infinity, rate: 30 },
]

/**
 * NEW TAX REGIME — FY 2024-25 (Budget 2024 revision)
 * No deductions allowed. Default regime from April 2024.
 */
export const TAX_SLABS_NEW_FY2024: TaxSlab[] = [
  { lower: 0, upper: 300000, rate: 0 },
  { lower: 300000, upper: 700000, rate: 5 },
  { lower: 700000, upper: 1000000, rate: 10 },
  { lower: 1000000, upper: 1200000, rate: 15 },
  { lower: 1200000, upper: 1500000, rate: 20 },
  { lower: 1500000, upper: Infinity, rate: 30 },
]

/**
 * NEW TAX REGIME — FY 2025-26 onwards (Budget 2025 revision)
 * Higher exemption limit, additional 25% slab.
 */
export const TAX_SLABS_NEW_FY2025: TaxSlab[] = [
  { lower: 0, upper: 400000, rate: 0 },
  { lower: 400000, upper: 800000, rate: 5 },
  { lower: 800000, upper: 1200000, rate: 10 },
  { lower: 1200000, upper: 1600000, rate: 15 },
  { lower: 1600000, upper: 2000000, rate: 20 },
  { lower: 2000000, upper: 2400000, rate: 25 },
  { lower: 2400000, upper: Infinity, rate: 30 },
]

// Backward-compatible aliases
export const TAX_SLABS_OLD = TAX_SLABS_NEW_FY2024
export const TAX_SLABS_NEW = TAX_SLABS_NEW_FY2025

/**
 * Old Regime slabs by FY — the old regime hasn't changed in years,
 * same slabs apply to all FYs.
 */
export function getOldRegimeSlabs(): TaxSlab[] {
  return TAX_SLABS_OLD_REGIME
}

/**
 * New Regime slabs by FY — slabs changed in Budget 2024 and Budget 2025.
 * - FY 2025-26+ (start year >= 2025): Budget 2025 slabs
 * - FY 2024-25 (start year 2024): Budget 2024 slabs
 * - FY 2023-24 and earlier: Budget 2023 slabs (3-6L @5%, same as pre-2024)
 */
export function getNewRegimeSlabs(fyStartYear: number): TaxSlab[] {
  if (fyStartYear >= 2025) return TAX_SLABS_NEW_FY2025
  return TAX_SLABS_NEW_FY2024
}

/**
 * Get the correct tax slabs for a given FY and regime.
 * This is the single function pages should call.
 */
export function getTaxSlabs(
  fyStartYear: number,
  regime: 'new' | 'old',
): TaxSlab[] {
  return regime === 'old'
    ? getOldRegimeSlabs()
    : getNewRegimeSlabs(fyStartYear)
}

// ────────────────────────────────────────────
// Tax Calculation Functions
// ────────────────────────────────────────────

// ────────────────────────────────────────────
// Surcharge rates (applicable on base tax)
// ────────────────────────────────────────────

interface SurchargeRate {
  above: number
  rate: number
}

const SURCHARGE_OLD_REGIME: SurchargeRate[] = [
  { above: 50000000, rate: 0.37 },
  { above: 20000000, rate: 0.25 },
  { above: 10000000, rate: 0.15 },
  { above: 5000000, rate: 0.10 },
]

const SURCHARGE_NEW_REGIME: SurchargeRate[] = [
  { above: 20000000, rate: 0.25 },
  { above: 10000000, rate: 0.15 },
  { above: 5000000, rate: 0.10 },
]

function computeSurcharge(
  taxableIncome: number,
  baseTax: number,
  isNewRegime: boolean,
): number {
  const rates = isNewRegime ? SURCHARGE_NEW_REGIME : SURCHARGE_OLD_REGIME
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
  if (isNewRegime) {
    if (fyStartYear >= 2025) {
      // FY 2025-26+: rebate if taxable income <= 12L
      return { maxIncome: 1200000, maxRebate: 60000 }
    }
    // FY 2024-25: rebate if taxable income <= 7L
    return { maxIncome: 700000, maxRebate: 25000 }
  }
  // Old regime: rebate if taxable income <= 5L
  return { maxIncome: 500000, maxRebate: 12500 }
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

  // 2. Apply Section 87A rebate (before surcharge)
  const rebateConfig = getRebateConfig(isNewRegime, fyStartYear)
  let rebate87A = 0
  if (taxableIncome <= rebateConfig.maxIncome) {
    rebate87A = Math.min(baseTax, rebateConfig.maxRebate)
  }
  const taxAfterRebate = Math.max(0, baseTax - rebate87A)

  // 3. Compute surcharge
  const surcharge = computeSurcharge(
    taxableIncome, taxAfterRebate, isNewRegime
  )

  // 4. Health & Education Cess (4% on tax + surcharge)
  const cess = (taxAfterRebate + surcharge) * CESS_RATE

  // 5. Professional Tax
  const professionalTax = applyProfessionalTax
    ? PROFESSIONAL_TAX_PER_MONTH
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

/**
 * Reverse-calculate gross income from net income (after tax).
 *
 * Uses an iterative approach converging within `maxIterations` rounds,
 * stopping when the error is less than Rs 1.
 */
export function calculateGrossFromNet(
  netIncome: number,
  slabs: TaxSlab[],
  standardDeduction: number = 0,
  applyProfessionalTax: boolean = true,
  salaryMonthsCount: number = 12,
  maxIterations: number = 10,
  isNewRegime: boolean = true,
  fyStartYear: number = 2025,
): number {
  if (netIncome <= 0) {
    return 0
  }

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

    const error = netIncome - calculatedNet
    grossIncome += error
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
 * Get the standard deduction amount based on the FY start year.
 *
 * Rs 75,000 from FY 2024-25 onwards; Rs 50,000 before that.
 */
export function getStandardDeduction(fyStartYear: number): number {
  return fyStartYear >= 2024 ? 75000 : 50000
}

/**
 * Parse the numeric start year from an FY label like "FY 2025-26".
 */
export function parseFYStartYear(fyLabel: string): number {
  return Number.parseInt(fyLabel.split(' ')[1]?.split('-')[0] || '0', 10)
}

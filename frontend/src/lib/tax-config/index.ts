/**
 * Tax configuration — single source of truth for Indian income tax rules.
 *
 * Each FY has its own entry. When Budget YYYY changes rates, add a new
 * FY entry rather than modifying the old one — historical calculations
 * must stay stable. Loader picks by FY start year with newest-first
 * fallback so "FY 2030" picks up the latest known FY until updated.
 *
 * `source` links the Budget notification so a future maintainer can
 * verify values against the original document.
 */

import type { TaxSlab } from '../taxCalculator'

export interface SurchargeBand {
  above: number
  rate: number
}

export interface RebateConfig {
  maxIncome: number
  maxRebate: number
}

export interface RegimeConfig {
  slabs: TaxSlab[]
  surcharge: SurchargeBand[]
  rebate87A: RebateConfig
  standardDeduction: number
}

export interface FYTaxConfig {
  fyStartYear: number
  fyLabel: string
  source: string
  effectiveFrom: string
  oldRegime: RegimeConfig
  newRegime: RegimeConfig
  /** Flat monthly professional tax (state-uniform default; per-state TAX-2) */
  professionalTaxPerMonth: number
  /** Health & education cess on (tax after rebate + surcharge) */
  cessRate: number
}

// ─── Old regime — unchanged across FYs ──────────────────────────────────────
// Same slabs / surcharge / rebate from FY 2020-21 onward. Embedded in each
// FY block by reference so a future Budget that changes old-regime rules
// can diverge without a global edit.

const OLD_REGIME_BASE: RegimeConfig = {
  slabs: [
    { lower: 0, upper: 250_000, rate: 0 },
    { lower: 250_000, upper: 500_000, rate: 5 },
    { lower: 500_000, upper: 1_000_000, rate: 20 },
    { lower: 1_000_000, upper: Infinity, rate: 30 },
  ],
  surcharge: [
    { above: 50_000_000, rate: 0.37 },
    { above: 20_000_000, rate: 0.25 },
    { above: 10_000_000, rate: 0.15 },
    { above: 5_000_000, rate: 0.1 },
  ],
  rebate87A: { maxIncome: 500_000, maxRebate: 12_500 },
  standardDeduction: 50_000,
}

// ─── FY 2020-21 to FY 2022-23 (original Section 115BAC, Finance Act 2020) ───
// Optional regime with 2.5L-wide slabs. No standard deduction (Finance Act
// 2023 added it from FY 2023-24). Section 87A: rebate up to 12,500 for total
// income up to 5L, same as the old regime. Surcharge followed the old-regime
// bands, including 37% above 5 Cr: the 25% cap for the new regime arrived with
// Finance Act 2023. Cess is 4%. Not modelled: the 15% surcharge cap on
// dividends and listed-equity capital gains.

const NEW_REGIME_115BAC_ORIGINAL: RegimeConfig = {
  slabs: [
    { lower: 0, upper: 250_000, rate: 0 },
    { lower: 250_000, upper: 500_000, rate: 5 },
    { lower: 500_000, upper: 750_000, rate: 10 },
    { lower: 750_000, upper: 1_000_000, rate: 15 },
    { lower: 1_000_000, upper: 1_250_000, rate: 20 },
    { lower: 1_250_000, upper: 1_500_000, rate: 25 },
    { lower: 1_500_000, upper: Infinity, rate: 30 },
  ],
  surcharge: [
    { above: 50_000_000, rate: 0.37 },
    { above: 20_000_000, rate: 0.25 },
    { above: 10_000_000, rate: 0.15 },
    { above: 5_000_000, rate: 0.1 },
  ],
  rebate87A: { maxIncome: 500_000, maxRebate: 12_500 },
  standardDeduction: 0,
}

// ─── FY 2023-24 (Budget 2023 new regime) ────────────────────────────────────

const NEW_REGIME_FY2023: RegimeConfig = {
  slabs: [
    { lower: 0, upper: 300_000, rate: 0 },
    { lower: 300_000, upper: 600_000, rate: 5 },
    { lower: 600_000, upper: 900_000, rate: 10 },
    { lower: 900_000, upper: 1_200_000, rate: 15 },
    { lower: 1_200_000, upper: 1_500_000, rate: 20 },
    { lower: 1_500_000, upper: Infinity, rate: 30 },
  ],
  surcharge: [
    { above: 20_000_000, rate: 0.25 },
    { above: 10_000_000, rate: 0.15 },
    { above: 5_000_000, rate: 0.1 },
  ],
  rebate87A: { maxIncome: 700_000, maxRebate: 25_000 },
  standardDeduction: 50_000,
}

// ─── FY 2024-25 (Budget 2024) ───────────────────────────────────────────────

const NEW_REGIME_FY2024: RegimeConfig = {
  slabs: [
    { lower: 0, upper: 300_000, rate: 0 },
    { lower: 300_000, upper: 700_000, rate: 5 },
    { lower: 700_000, upper: 1_000_000, rate: 10 },
    { lower: 1_000_000, upper: 1_200_000, rate: 15 },
    { lower: 1_200_000, upper: 1_500_000, rate: 20 },
    { lower: 1_500_000, upper: Infinity, rate: 30 },
  ],
  surcharge: [
    { above: 20_000_000, rate: 0.25 },
    { above: 10_000_000, rate: 0.15 },
    { above: 5_000_000, rate: 0.1 },
  ],
  rebate87A: { maxIncome: 700_000, maxRebate: 25_000 },
  standardDeduction: 75_000,
}

// ─── FY 2025-26 (Budget 2025 — major revision) ──────────────────────────────

const NEW_REGIME_FY2025: RegimeConfig = {
  slabs: [
    { lower: 0, upper: 400_000, rate: 0 },
    { lower: 400_000, upper: 800_000, rate: 5 },
    { lower: 800_000, upper: 1_200_000, rate: 10 },
    { lower: 1_200_000, upper: 1_600_000, rate: 15 },
    { lower: 1_600_000, upper: 2_000_000, rate: 20 },
    { lower: 2_000_000, upper: 2_400_000, rate: 25 },
    { lower: 2_400_000, upper: Infinity, rate: 30 },
  ],
  surcharge: [
    { above: 20_000_000, rate: 0.25 },
    { above: 10_000_000, rate: 0.15 },
    { above: 5_000_000, rate: 0.1 },
  ],
  rebate87A: { maxIncome: 1_200_000, maxRebate: 60_000 },
  standardDeduction: 75_000,
}

// ─── Ordered list (oldest → newest) ─────────────────────────────────────────

const FY_CONFIGS: FYTaxConfig[] = [
  {
    fyStartYear: 2020,
    fyLabel: 'FY 2020-21',
    source: 'Finance Act 2020 (Section 115BAC)',
    effectiveFrom: '2020-04-01',
    oldRegime: OLD_REGIME_BASE,
    newRegime: NEW_REGIME_115BAC_ORIGINAL,
    professionalTaxPerMonth: 200,
    cessRate: 0.04,
  },
  {
    fyStartYear: 2021,
    fyLabel: 'FY 2021-22',
    source: 'Finance Act 2021 (Section 115BAC unchanged)',
    effectiveFrom: '2021-04-01',
    oldRegime: OLD_REGIME_BASE,
    newRegime: NEW_REGIME_115BAC_ORIGINAL,
    professionalTaxPerMonth: 200,
    cessRate: 0.04,
  },
  {
    fyStartYear: 2022,
    fyLabel: 'FY 2022-23',
    source: 'Finance Act 2022 (Section 115BAC unchanged)',
    effectiveFrom: '2022-04-01',
    oldRegime: OLD_REGIME_BASE,
    newRegime: NEW_REGIME_115BAC_ORIGINAL,
    professionalTaxPerMonth: 200,
    cessRate: 0.04,
  },
  {
    fyStartYear: 2023,
    fyLabel: 'FY 2023-24',
    source: 'Budget 2023 (Feb 2023)',
    effectiveFrom: '2023-04-01',
    oldRegime: OLD_REGIME_BASE,
    newRegime: NEW_REGIME_FY2023,
    professionalTaxPerMonth: 200,
    cessRate: 0.04,
  },
  {
    fyStartYear: 2024,
    fyLabel: 'FY 2024-25',
    source: 'Budget 2024 (Jul 2024)',
    effectiveFrom: '2024-04-01',
    oldRegime: OLD_REGIME_BASE,
    newRegime: NEW_REGIME_FY2024,
    professionalTaxPerMonth: 200,
    cessRate: 0.04,
  },
  {
    fyStartYear: 2025,
    fyLabel: 'FY 2025-26',
    source: 'Budget 2025 (Feb 2025)',
    effectiveFrom: '2025-04-01',
    oldRegime: OLD_REGIME_BASE,
    newRegime: NEW_REGIME_FY2025,
    professionalTaxPerMonth: 200,
    cessRate: 0.04,
  },
]

/**
 * Get tax config for a specific FY. If the requested FY is newer than any
 * known config, returns the latest known one (so the app keeps working
 * after a year rollover until this file is updated). Years before FY 2020-21
 * (when the new regime did not exist) fall back to the oldest known config.
 */
export function getTaxConfig(fyStartYear: number): FYTaxConfig {
  // Newest-first lookup so we find the most recent applicable config.
  for (let i = FY_CONFIGS.length - 1; i >= 0; i--) {
    const cfg = FY_CONFIGS[i]
    if (fyStartYear >= cfg.fyStartYear) return cfg
  }
  return FY_CONFIGS[0]
}

/**
 * Get all known FYs (useful for UI year pickers).
 */
export function getAllFYConfigs(): readonly FYTaxConfig[] {
  return FY_CONFIGS
}

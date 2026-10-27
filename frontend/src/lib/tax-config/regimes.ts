/**
 * Regime rate tables (slabs, surcharge, rebate, standard deduction) shared by
 * the per-year entries in `./index.ts`. A year that keeps the previous year's
 * rules points at the same object; a year that changes them gets a new one.
 */

import type { TaxSlab } from '../taxCalculator'

interface SurchargeBand {
  above: number
  rate: number
}

interface RebateConfig {
  maxIncome: number
  maxRebate: number
}

export interface RegimeConfig {
  slabs: TaxSlab[]
  surcharge: SurchargeBand[]
  rebate87A: RebateConfig
  standardDeduction: number
}

// ─── Old regime -- unchanged across FYs ──────────────────────────────────────
// Same slabs / surcharge / rebate from FY 2020-21 onward. Embedded in each
// FY block by reference so a future Budget that changes old-regime rules
// can diverge without a global edit.

export const OLD_REGIME_BASE: RegimeConfig = {
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

export const NEW_REGIME_115BAC_ORIGINAL: RegimeConfig = {
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

export const NEW_REGIME_FY2023: RegimeConfig = {
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

export const NEW_REGIME_FY2024: RegimeConfig = {
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

// ─── FY 2025-26 (Budget 2025 -- major revision) ──────────────────────────────
// Also Tax Year 2026-27: Finance Act 2026 kept these figures for the s.202
// default regime of the Income-tax Act 2025 (see the entry in ./index.ts).

export const NEW_REGIME_FY2025: RegimeConfig = {
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

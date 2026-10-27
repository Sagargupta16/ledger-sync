/**
 * Tax configuration -- single source of truth for Indian income tax rules.
 *
 * Each FY has its own entry. When Budget YYYY changes rates, add a new
 * FY entry rather than modifying the old one -- historical calculations
 * must stay stable. Loader picks by FY start year with newest-first
 * fallback so "FY 2030" picks up the latest known FY until updated.
 *
 * `source` links the Budget notification so a future maintainer can
 * verify values against the original document.
 *
 * The rate tables live in `./regimes.ts`, the Income-tax Act 2025 section
 * map in `./sections.ts` and the "Tax Year" naming in `./taxYear.ts`.
 */

import {
  NEW_REGIME_115BAC_ORIGINAL,
  NEW_REGIME_FY2023,
  NEW_REGIME_FY2024,
  NEW_REGIME_FY2025,
  OLD_REGIME_BASE,
  type RegimeConfig,
} from './regimes'

export {
  deductionLabel,
  formatSectionRef,
  OLD_REGIME_DEDUCTIONS,
  sectionTooltip,
  type DeductionKey,
} from './sections'
export { formatTaxYearLabel, isAct2025Year, taxYearKey } from './taxYear'

interface FYTaxConfig {
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
  // Tax Year 2026-27: the Income-tax Act 2025 replaced the 1961 Act from
  // 2026-04-01 and Finance Act 2026 changed no personal rate, so every figure
  // equals FY 2025-26 (cess and professional tax are carried over). Default
  // regime s.202(1): nil to 4L, 5% to 8L, 10% to 12L, 15% to 16L, 20% to 20L,
  // 25% to 24L, 30% above; old (opt-out) regime slabs unchanged in the First
  // Schedule. Standard deduction s.19(1) Table item 2: 75,000 in the default
  // regime, 50,000 otherwise. Rebate s.156: 60,000 up to 12L with marginal
  // relief (default), 12,500 up to 5L (old). Surcharge 10/15/25% above
  // 50L/1Cr/2Cr, 37% above 5Cr in the old regime only. Sources, read 2026-10-26:
  // https://www.pib.gov.in/PressReleasePage.aspx?PRID=2248005&reg=48&lang=2
  // https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/objective-and-scope-new-act
  // https://web.archive.org/web/20260612085646id_/https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf
  // https://www.indiabudget.gov.in/doc/memo.pdf
  {
    fyStartYear: 2026,
    fyLabel: 'Tax Year 2026-27',
    source: 'Income-tax Act 2025 (s.202) and Finance Act 2026',
    effectiveFrom: '2026-04-01',
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

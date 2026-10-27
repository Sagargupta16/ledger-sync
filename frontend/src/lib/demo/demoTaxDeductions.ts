import { OLD_REGIME_DEDUCTIONS, type DeductionKey } from '@/lib/tax-config'
import type { SavedTaxDeductions } from '@/services/api/taxDeductions'
import type { Transaction } from '@/types'

/** Demo ledger rows (category, subcategory) that count toward each section. */
const DEMO_SECTION_ROWS: Partial<Record<DeductionKey, ReadonlyArray<readonly [string, string]>>> = {
  // Employee EPF and PPF contributions, plus the term-life premium.
  '80C': [['Investment', 'EPF'], ['Investment', 'PPF'], ['Miscellaneous', 'Insurance']],
  // The annual health-insurance premium.
  '80D': [['Healthcare', 'Insurance']],
}

/**
 * Demo answer for `GET /api/tax-deductions/{tax_year}`: what the demo ledger
 * itself supports for that April-March year, each section capped at its input
 * limit. The demo has no NPS or home-loan rows, and HRA needs the salary split,
 * so those stay empty.
 */
export function generateDemoTaxDeductions(
  txs: Transaction[],
  _params: Record<string, unknown>,
  url: string,
): SavedTaxDeductions {
  const taxYear = /\/tax-deductions\/(\d{4}-\d{2})/.exec(url)?.[1] ?? ''
  const deductions: SavedTaxDeductions['deductions'] = {}
  if (!taxYear) return { tax_year: taxYear, deductions }

  const startYear = Number(taxYear.slice(0, 4))
  const from = `${startYear}-04-01`
  const to = `${startYear + 1}-03-31`
  const inYear = txs.filter((t) => t.date >= from && t.date <= to)
  for (const field of OLD_REGIME_DEDUCTIONS) {
    const rows = DEMO_SECTION_ROWS[field.key]
    if (!rows) continue
    const total = inYear
      .filter((t) => rows.some(([category, subcategory]) => t.category === category && t.subcategory === subcategory))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
    if (total > 0) deductions[field.key] = Math.min(field.max, Math.round(total * 100) / 100)
  }
  return { tax_year: taxYear, deductions }
}

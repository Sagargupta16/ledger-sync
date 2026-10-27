import { formatDate, getActiveLocale } from '@/lib/formatters'
import type { ForeignAssetEventIssue, StockSplit } from '@/services/api/rsuTax'

/** Short labels for the flags the lot ledger and Schedule FA rows carry. */
const FLAG_LABEL: Record<string, string> = {
  quantity_estimated: 'Received units estimated',
  fx_approximate: 'ECB approximation',
  missing_vest_price: 'Vest price missing',
  vest_price_not_inr: 'Vest price not in rupees',
  fx_date_mismatch: 'Rate date off',
  oversold: 'Sold more than held',
  split_since_vest: 'Split since vest',
  vest_price_pre_split: 'Check the vest price is pre-split',
  no_prices: 'No market prices',
  no_peak_value: 'No peak value',
  no_closing_value: 'No closing value',
  no_rates: 'No ECB rate',
}

export function flagLabels(flags: readonly string[]): string[] {
  return flags.map((flag) => FLAG_LABEL[flag] ?? flag)
}

/** Why a sale or dividend is left out of Schedule FA, and what fixes it. */
export const EVENT_ISSUE_LABEL: Record<ForeignAssetEventIssue, string> = {
  unlinked: 'Not counted in Schedule FA: no vest linked',
  before_vest: 'Not counted in Schedule FA: dated before its vest',
  unknown_stock: 'Not counted in Schedule FA: no grant uses this stock',
  no_shares_held: 'Not counted in Schedule FA: no shares held that day',
  indian_stock: 'Indian stock, not a foreign asset',
}

/** Share counts keep their fractions: brokers credit fractional residuals. */
export function formatShares(value: number): string {
  return value.toLocaleString(getActiveLocale(), { maximumFractionDigits: 6 })
}

/** "20:1 split on 6 Jun 2022" for each split since a vest. */
export function splitNote(splits: readonly StockSplit[]): string {
  return splits.map((split) => `${split.ratio} split on ${formatDate(split.ex_date)}`).join(', ')
}

/** "AY 2026-27" for calendar year 2025, the return its Schedule FA belongs to. */
export function assessmentYearLabel(calendarYear: number): string {
  if (calendarYear >= 2026) return `Tax year ${calendarYear}-${String((calendarYear + 1) % 100).padStart(2, '0')}`
  return `AY ${calendarYear + 1}-${String((calendarYear + 2) % 100).padStart(2, '0')}`
}

export const COMPUTATION_NOTE =
  'A computation aid, not tax advice. Confirm every figure with a CA before filing.'

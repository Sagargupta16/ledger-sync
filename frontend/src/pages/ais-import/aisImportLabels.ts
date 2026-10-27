import { formatDate } from '@/lib/formatters'
import { maskPans } from '@/lib/tax/aisFields'
import type { AisHead } from '@/lib/tax/aisTypes'
import { formatTaxYearLabel, isAct2025Year, taxYearKey } from '@/lib/tax-config/taxYear'

export const COMPUTATION_NOTE =
  'A computation aid, not tax advice. Confirm every figure on the AIS portal and with a CA before filing.'

export const PRIVACY_NOTE =
  'The file is opened in this browser tab. Your PAN and date of birth form its password: they are never sent, saved or logged, and the statement itself never leaves this tab. Saving stores only four totals for the year.'

export const HEAD_LABEL: Record<AisHead, string> = {
  salary: 'Salary',
  interest: 'Interest',
  dividend: 'Dividends',
  rent: 'Rent',
  business: 'Business or profession',
  capital_gains: 'Capital gains',
  other: 'Other',
}

/** "FY 2024-25 (AY 2025-26)" up to 2025-26; "Tax Year 2026-27" once the Income-tax Act 2025 applies. */
export function taxYearLabel(taxYear: string): string {
  const start = Number(taxYear.slice(0, 4))
  const name = formatTaxYearLabel(start)
  return isAct2025Year(start) ? name : `${name} (AY ${taxYearKey(start + 1)})`
}

/** The April-March year a "YYYY-MM-DD" day falls in, as "2025-26". */
export function taxYearOf(dayKey: string): string {
  const year = Number(dayKey.slice(0, 4))
  return taxYearKey(Number(dayKey.slice(5, 7)) >= 4 ? year : year - 1)
}

/** The year just ended: the one whose AIS is complete. */
export const defaultTaxYear = (todayKey: string): string => taxYearKey(Number(taxYearOf(todayKey).slice(0, 4)) - 1)

/** The current year and the five before it, plus the statement's own year if older. */
export function taxYearOptions(todayKey: string, statementYear: string | null): string[] {
  const current = Number(taxYearOf(todayKey).slice(0, 4))
  const years = Array.from({ length: 6 }, (_, i) => taxYearKey(current - i))
  if (statementYear && !years.includes(statementYear)) years.push(statementYear)
  return years.sort((a, b) => b.localeCompare(a))
}

/** AIS file names can carry the PAN. */
export const displayFileName = (name: string): string => maskPans(name)

export const formatAisDate = (date: string | null): string => (date ? formatDate(date) : '--')

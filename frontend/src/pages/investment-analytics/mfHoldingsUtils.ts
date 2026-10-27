import { inclusiveDaySpan } from '@/lib/dateUtils'
import { formatDate, getActiveLocale } from '@/lib/formatters'
import { numberFormat } from '@/lib/intlCache'
import type { CasImportResult, CasSource, MfImportInfo, XirrNote } from '@/services/api/cas'
import { usePreferencesStore } from '@/store/preferencesStore'
import { BASE_CURRENCY, effectiveCurrencyCode, getCurrencyMeta } from '@/constants/currencies'

export const SOURCE_LABELS: Record<CasSource, string> = {
  CAMS: 'CAMS',
  KFINTECH: 'KFintech',
  NSDL: 'NSDL',
  CDSL: 'CDSL',
}

/** Why a holding shows no XIRR, in the words the table's tooltip uses. */
export const XIRR_NOTES: Record<XirrNote, string> = {
  no_transactions:
    'This statement lists holdings only (a summary or demat CAS), so it has no dated flows for XIRR.',
  opening_balance:
    'The statement starts after your first purchase. Import a Detailed CAS from your first investment date for XIRR.',
  no_nav: 'Neither AMFI nor the statement has a NAV for this scheme, so it has no value today.',
  no_solution: 'These cash flows have no XIRR.',
}

/** The same reasons in a few words, shown under the dash where a phone has no tooltip. */
export const XIRR_HINTS: Record<XirrNote, string> = {
  no_transactions: 'holdings only',
  opening_balance: 'needs full history',
  no_nav: 'no NAV',
  no_solution: 'no rate',
}

/**
 * A NAV with the four decimals AMFI publishes (28.7924), in the display currency
 * like every other amount, so units x NAV reconciles with the Value column.
 * `formatCurrency` stops at two decimals, which hides most of a NAV.
 */
export function formatNav(nav: number): string {
  const { displayCurrency, exchangeRate } = usePreferencesStore.getState()
  const code = effectiveCurrencyCode(displayCurrency, exchangeRate)
  const meta = getCurrencyMeta(code)
  const shown = code === BASE_CURRENCY || exchangeRate === null ? nav : nav * exchangeRate
  const digits = numberFormat(meta.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(shown)
  return meta.symbolPosition === 'before' ? `${meta.symbol}${digits}` : `${digits}${meta.symbol}`
}

/** Under a year the annualised rate swings hard, so the table says so beside it. */
export function isUnderOneYear(since: string | null, asOf: string | null): boolean {
  if (!since || !asOf) return false
  return inclusiveDaySpan(since, asOf) - 1 < 365
}

export function formatUnits(units: number): string {
  return units.toLocaleString(getActiveLocale(), { maximumFractionDigits: 3 })
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

function casKind(source: CasSource, casType: string | null): string {
  const issuer = SOURCE_LABELS[source]
  return casType ? `${issuer} ${casType.toLowerCase()} CAS` : `${issuer} CAS`
}

function statementPeriod(from: string | null, to: string | null): string | null {
  return from && to ? `${formatDate(from)} to ${formatDate(to)}` : null
}

/** "CAMS detailed CAS, Apr 01, 2015 to Sep 30, 2026, 7 schemes, imported Oct 27, 2026". */
export function describeImport(info: MfImportInfo): string {
  const period = statementPeriod(info.statement_from, info.statement_to)
  const kind = casKind(info.source, info.cas_type)
  const schemes = plural(info.schemes, 'scheme')
  return `${kind}${period ? `, ${period}` : ''}, ${schemes}, imported ${formatDate(new Date(info.imported_at))}`
}

/** What one import did: "Imported 7 schemes (5 with units) and 120 transactions from a CAMS detailed CAS ...". */
export function describeImportResult(result: CasImportResult): string {
  const period = statementPeriod(result.statement_from, result.statement_to)
  const kind = casKind(result.source, result.cas_type)
  const replaced =
    result.replaced > 0
      ? ` It replaced ${plural(result.replaced, 'holding')} from your previous import.`
      : ''
  return (
    `Imported ${plural(result.schemes, 'scheme')} (${result.holdings} with units) and ` +
    `${plural(result.transactions, 'transaction')} from a ${kind}${period ? ` covering ${period}` : ''}.${replaced}`
  )
}

/** "2 of 3 schemes" when a figure covers only some of the held schemes, else null. */
export function partialCoverage(covered: number, held: number): string | null {
  return covered < held ? `${covered} of ${held} schemes` : null
}

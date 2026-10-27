/**
 * Reading values out of AIS rows. The AIS JSON is a generic label/data grid
 * that nobody schema-validates, so field identity comes only from column
 * labels matched by pattern, never from column position, and every value is a
 * string that may or may not parse.
 */

/** PAN shape: five letters, four digits, one letter, not inside a longer token ("_" does not join). */
const PAN_RE = /(?<![A-Za-z0-9])[A-Za-z]{5}\d{4}[A-Za-z](?![A-Za-z0-9])/g

/** Every PAN-shaped token keeps its first 3 and last character ("ABCXXXXXXF", as itr-agent's maskPan does). */
export const maskPans = (value: string): string =>
  value.replaceAll(PAN_RE, (match: string) => `${match.slice(0, 3)}XXXXXX${match.slice(-1)}`)

/** Labels whose value identifies the taxpayer; never shown at all. */
const IDENTITY_LABEL_RE = /mobile|phone|e-?mail|address|birth|\bdob\b|passport|aadhaa?r/i

/** Labels that name an account-like identifier; its number is shown with its last 4 characters. */
const ACCOUNT_LABEL_RE = /account|a\/c|folio|demat|dp\s*id|client\s*id|card|certificate|policy/i

/** Labels that name a sum, a rate or a date, not an identifier: "Amount credited to account", "Policy Premium Amount". */
const NOT_ID_LABEL_RE = /amount|value|interest|\btax\b|\btds\b|\btcs\b|income|consideration|price|premium|balance|payment|paid|credited|debited|\brate\b|\bdate\b/i

/** Labels that end in an identifier word ("Account Number", "Folio No.", "Client ID"): these win over a money word. */
const ID_SUFFIX_RE = /(?:number|\bno\b|\bnum\b|\bid)[\s.:)]*$/i

/** An amount carries a decimal point or a currency mark; an identifier never does. */
const AMOUNT_SHAPE_RE = /\d\.\d|₹|\brs\b|\binr\b/i

/**
 * A cell under an account-like label whose value is a long number and not an
 * amount. Masking is by label, so an amount that merely mentions an account
 * ("Amount credited to account", "Card Payment Amount") must stay readable:
 * a masked cell no longer parses and its money would drop out of every total.
 * A label that ends in an identifier word is always an identifier.
 */
function isAccountNumber(label: string, value: string): boolean {
  if (!ACCOUNT_LABEL_RE.test(label) || !/\d{5,}/.test(value)) return false
  if (ID_SUFFIX_RE.test(label.trim())) return true
  return !NOT_ID_LABEL_RE.test(label) && !AMOUNT_SHAPE_RE.test(value)
}

/**
 * Mask what an AIS cell must not display: PAN-shaped tokens (`maskPans`),
 * identity fields (hidden), and account numbers (last 4 characters kept).
 */
export function maskAisValue(label: string, value: string): string {
  if (IDENTITY_LABEL_RE.test(label)) return '(hidden)'
  const masked = maskPans(value)
  if (isAccountNumber(label, masked)) {
    const tail = masked.replaceAll(/[^0-9A-Za-z]/g, '').slice(-4)
    return `XXXX${tail}`
  }
  return masked
}

/**
 * Rupees from "1,50,000.00", "Rs. 1500/-" or "₹ 1500"; undefined unless the
 * whole cell is a number, so "15 Apr 2024" or "194A" never read as 15 or 194.
 */
export function parseAisAmount(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const text = value.replaceAll(/[,\s₹]|INR|Rs\.?|\/-/gi, '')
  return /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text) ? Number(text) : undefined
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

function isoDate(year: number, month: number, day: number): string | undefined {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1) return undefined
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return undefined
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * "YYYY-MM-DD" from the forms an AIS export uses: ISO, DD-MM-YYYY (Indian
 * day-first order), "31-Mar-2025" and epoch milliseconds (read on the IST
 * calendar). Undefined for anything else, so an odd date never shifts a row
 * into the wrong tax year.
 */
export function parseAisDate(value: string | undefined): string | undefined {
  const text = value?.trim()
  if (!text) return undefined
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]))
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(text)
  if (match) return isoDate(Number(match[3]), Number(match[2]), Number(match[1]))
  match = /^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s,]+(\d{4})/.exec(text)
  if (match) {
    const month = MONTHS[match[2].slice(0, 3).toLowerCase()]
    return month ? isoDate(Number(match[3]), month, Number(match[1])) : undefined
  }
  if (/^\d{12,13}$/.test(text)) {
    // IST is UTC+5:30, so shift before reading the calendar day.
    const ist = new Date(Number(text) + 330 * 60_000)
    return isoDate(ist.getUTCFullYear(), ist.getUTCMonth() + 1, ist.getUTCDate())
  }
  return undefined
}

/**
 * The value of the first label that matches a pattern, trying the patterns in
 * order of preference. Labels matching `skip` never count.
 */
export function pickField(
  fields: Readonly<Record<string, string>>,
  patterns: readonly RegExp[],
  skip?: RegExp,
): string | undefined {
  const labels = Object.keys(fields)
  for (const pattern of patterns) {
    const label = labels.find((candidate) => pattern.test(candidate) && !skip?.test(candidate))
    if (label !== undefined) return fields[label]
  }
  return undefined
}

/**
 * Like `pickField`, for a number: the first matching label whose value parses
 * as an amount, so a "Processed On" date never reads as an amount.
 */
function pickAmount(
  fields: Readonly<Record<string, string>>,
  patterns: readonly RegExp[],
  skip: RegExp,
): number | undefined {
  const labels = Object.keys(fields).filter((label) => !skip.test(label))
  for (const pattern of patterns) {
    for (const label of labels) {
      if (!pattern.test(label) || parseAisDate(fields[label]) !== undefined) continue
      const amount = parseAisAmount(fields[label])
      if (amount !== undefined) return amount
    }
  }
  return undefined
}

/** Labels that hold a tax amount, a date, a rate or a per-unit price: never the gross amount. */
const NOT_GROSS_RE = /\btds\b|\btcs\b|\btax\b|deducted|deposited|collected|\bdate|\brate\b|per\s*unit/i

/**
 * Gross amount paid, credited or transacted. A taxpayer's accepted feedback
 * ("Modified" / "Processed" value) wins over what the source reported.
 */
export const grossAmountOf = (fields: Readonly<Record<string, string>>): number | undefined =>
  pickAmount(
    fields,
    [
      /modified|processed|derived/i,
      /amount\s*paid|paid\s*\/\s*(credited|debited)|credited|amount\s*of\s*(payment|transaction)|gross/i,
      /reported\s*(value|amount)/i,
      /amount|value/i,
      /consideration|total/i,
      /income|interest|dividend/i,
      /price/i,
    ],
    NOT_GROSS_RE,
  )

/** TDS or TCS on the row: the deposited figure (what 26AS credits) before the deducted one. */
export const taxAmountOf = (fields: Readonly<Record<string, string>>): number | undefined =>
  pickAmount(fields, [/deposited/i, /deducted|collected/i, /\btds\b|\btcs\b/i], /\bdate|\brate\b|status|section|challan/i)

export const dateOf = (fields: Readonly<Record<string, string>>): string | undefined =>
  parseAisDate(
    pickField(
      fields,
      [/date\s*of\s*(payment|credit|transaction)|(payment|credit|transaction)\s*date/i, /date/i],
      /birth/i,
    ),
  )

export const sectionOf = (fields: Readonly<Record<string, string>>): string | undefined =>
  pickField(fields, [/^\s*section\s*$|section\s*code|tds\s*section/i, /information\s*code|info\s*code|sft\s*code/i])

export const descriptionOf = (fields: Readonly<Record<string, string>>): string | undefined =>
  pickField(fields, [/description/i, /nature|particulars|category|type\s*of/i, /\btype\b/i])

/** The payer, deductor, employer or reporting entity a row names. */
export const sourceNameOf = (fields: Readonly<Record<string, string>>): string | undefined =>
  pickField(fields, [
    /information\s*source|reporting\s*entity|filer\s*name/i,
    /name\s*of\s*(the\s*)?(deductor|collector|employer|payer|bank|company|entity|reporting)/i,
    /deductor|collector|employer|payer|bank\s*name|company\s*name/i,
    /source/i,
  ])

export const quantityOf = (fields: Readonly<Record<string, string>>): number | undefined =>
  pickAmount(fields, [/quantity|no\.?\s*of\s*(units|shares)|\bunits\b/i], /value|amount|price|\brate\b|\bdate/i)

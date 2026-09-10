/**
 * Client-side Excel/CSV parser.
 *
 * Reads a File via SheetJS, maps flexible column names to standard fields,
 * validates required data, and returns structured rows ready for the backend.
 */

import { COLUMN_MAPPINGS, REQUIRED_COLUMNS, VALID_TYPES } from '@/constants/columns'
import { MS_PER_DAY } from '@/lib/dateUtils'

export interface ParsedTransaction {
  date: string
  amount: number
  currency: string
  type: string
  account: string
  category: string
  subcategory?: string
  note?: string
}

export interface ParseResult {
  rows: ParsedTransaction[]
  fileName: string
  fileHash: string
}

export class FileParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileParseError'
  }
}

// Excel's day-0 epoch (1899-12-30 UTC); serial date numbers count days from here.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024
export const MAX_UPLOAD_ROWS = 100_000
const MAX_AMOUNT = 9_999_999_999_999.99
const MAX_LABEL_LENGTH = 255
const MAX_NOTE_LENGTH = 10_000
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

function stringify(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

async function computeFileHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function resolveColumnMapping(headers: string[]): Record<string, string> {
  const headerSet = new Set(headers)
  const mapping: Record<string, string> = {}

  for (const [standardName, candidates] of Object.entries(COLUMN_MAPPINGS)) {
    for (const candidate of candidates) {
      if (headerSet.has(candidate)) {
        mapping[standardName] = candidate
        break
      }
    }
  }

  const missing = REQUIRED_COLUMNS.filter((col) => !(col in mapping))
  if (missing.length > 0) {
    const details = missing.map((col) => {
      const expected = COLUMN_MAPPINGS[col].join(', ')
      return `'${col}' (expected one of: ${expected})`
    })
    throw new FileParseError(`Missing required columns: ${details.join('; ')}`)
  }

  return mapping
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function calendarDate(year: number, month: number, day: number, rowIndex: number): string {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  if (
    year < 1 || year > 9999
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new FileParseError(`Row ${rowIndex}: Date is not a valid calendar day. Use YYYY-MM-DD.`)
  }
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`
}

/**
 * Parse a date cell into a timezone-stable `YYYY-MM-DD` string.
 *
 * Every branch builds the result from explicit calendar components (or a UTC
 * epoch) so the stored day never shifts with the user's timezone. Using
 * `new Date(str).toISOString()` is unsafe: most non-ISO formats parse as LOCAL
 * midnight, and toISOString() then reprojects to UTC, shifting the day for any
 * non-UTC user (e.g. all of India, UTC+5:30). It also avoids `new Date()`'s
 * MM/DD assumption for ambiguous numeric dates -- this app is India-first, so
 * slash/dash numeric dates are read as DD/MM/YYYY.
 */
export function parseDate(value: unknown, rowIndex: number): string {
  if (value == null || value === '') {
    throw new FileParseError(`Row ${rowIndex}: Date is missing`)
  }

  if (typeof value === 'number') {
    // SheetJS Excel serial date number (UTC epoch -> UTC components).
    const date = new Date(EXCEL_EPOCH + value * MS_PER_DAY)
    return calendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), rowIndex)
  }

  const str = stringify(value).trim()

  // Preserve the calendar day of ISO timestamps, without timezone conversion.
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?$/.exec(str)
  if (isoMatch) {
    return calendarDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]), rowIndex)
  }

  // 2. Numeric day/month/year separated by / or - (India convention: DD/MM/YYYY).
  const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(str)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2])
    const year = Number(dmyMatch[3])
    return calendarDate(year, month, day, rowIndex)
  }

  const dayFirst = /^(\d{1,2})[- /]([a-z]+)[- ,/]+(\d{4})$/i.exec(str)
  const monthFirst = /^([a-z]+)[ ,/-]+(\d{1,2}),?[ ,/-]+(\d{4})$/i.exec(str)
  if (dayFirst || monthFirst) {
    const monthName = (dayFirst?.[2] ?? monthFirst?.[1] ?? '').toLowerCase()
    const month = MONTHS.findIndex((name) => name === monthName || name.slice(0, 3) === monthName) + 1
    const day = Number(dayFirst?.[1] ?? monthFirst?.[2])
    const year = Number(dayFirst?.[3] ?? monthFirst?.[3])
    return calendarDate(year, month, day, rowIndex)
  }
  throw new FileParseError(`Row ${rowIndex}: Could not parse date '${str}'. Use YYYY-MM-DD.`)
}

export function parseAmount(value: unknown, rowIndex: number): number {
  if (value == null || value === '') {
    throw new FileParseError(`Row ${rowIndex}: Amount is missing`)
  }

  const text = stringify(value).trim()
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
  const grouped = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d*)?$/
  if (text.length > 100 || (!decimal.test(text) && !grouped.test(text))) {
    throw new FileParseError(`Row ${rowIndex}: Amount must be a complete number, such as 1234.56.`)
  }

  const ungrouped = text.replaceAll(',', '').replace(/^[+-]/, '')
  const num = Number(ungrouped)
  if (!Number.isFinite(num) || num > MAX_AMOUNT) {
    throw new FileParseError(`Row ${rowIndex}: Amount is outside the supported INR range.`)
  }
  if (num < 0.005) return 0

  // Round decimal digits, not a binary float. Transaction type supplies the
  // direction; signed source amounts retain the existing magnitude behavior.
  const [mantissa, exponent = '0'] = ungrouped.toLowerCase().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  const digits = BigInt(`${whole || '0'}${fraction}`)
  const scale = fraction.length - Number(exponent) - 2
  if (scale <= 0) return Number(digits * 10n ** BigInt(-scale)) / 100
  const divisor = 10n ** BigInt(scale)
  return Number((digits + divisor / 2n) / divisor) / 100
}

function parseType(value: unknown, rowIndex: number): string {
  if (value == null || value === '') {
    throw new FileParseError(`Row ${rowIndex}: Transaction type is missing`)
  }

  const raw = stringify(value).trim()
  if (!VALID_TYPES.has(raw.toLowerCase())) {
    throw new FileParseError(
      `Row ${rowIndex}: Unknown transaction type '${raw}'. Expected: Income, Expense, Transfer-In, Transfer-Out`,
    )
  }
  return raw
}

function trimOrUndefined(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  const trimmed = stringify(value).trim()
  return trimmed || undefined
}

function parseRows(
  rawRows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
): ParsedTransaction[] {
  if (rawRows.length === 0) {
    throw new FileParseError('File contains no data rows')
  }
  if (rawRows.length > MAX_UPLOAD_ROWS) {
    throw new FileParseError(`File exceeds the ${MAX_UPLOAD_ROWS.toLocaleString()} row limit.`)
  }

  const rows: ParsedTransaction[] = []

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]
    // SheetJS preserves the worksheet row index even when blank rows are skipped.
    const rowNum = typeof raw.__rowNum__ === 'number' ? raw.__rowNum__ + 1 : i + 2

    const date = parseDate(raw[columnMapping.date], rowNum)
    const amount = parseAmount(raw[columnMapping.amount], rowNum)
    const type = parseType(raw[columnMapping.type], rowNum)
    const account = stringify(raw[columnMapping.account]).trim()
    const category = stringify(raw[columnMapping.category]).trim()

    if (!account) throw new FileParseError(`Row ${rowNum}: Account is missing`)
    if (!category) throw new FileParseError(`Row ${rowNum}: Category is missing`)

    const currency = (columnMapping.currency
      ? trimOrUndefined(raw[columnMapping.currency]) ?? 'INR'
      : 'INR').toUpperCase()
    if (currency !== 'INR') {
      throw new FileParseError(
        `Row ${rowNum}: ${currency} source amounts are not supported. Export or convert the source to INR. Display currency can still be changed in Settings.`,
      )
    }

    const row: ParsedTransaction = {
      date,
      amount,
      currency,
      type,
      account,
      category,
      subcategory: columnMapping.subcategory
        ? trimOrUndefined(raw[columnMapping.subcategory])
        : undefined,
      note: columnMapping.note ? trimOrUndefined(raw[columnMapping.note]) : undefined,
    }
    for (const field of ['account', 'category', 'subcategory', 'note'] as const) {
      const limit = field === 'note' ? MAX_NOTE_LENGTH : MAX_LABEL_LENGTH
      if ((row[field]?.length ?? 0) > limit) {
        throw new FileParseError(`Row ${rowNum}: ${field} must be at most ${limit} characters.`)
      }
    }
    rows.push(row)
  }

  return rows
}

export async function parseFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new FileParseError('File exceeds the 50 MB limit.')
  }
  if (file.name.length > 500) {
    throw new FileParseError('File name must be at most 500 characters. Rename the file and try again.')
  }
  const buffer = await file.arrayBuffer()

  if (buffer.byteLength === 0) {
    throw new FileParseError('File is empty')
  }

  // Lazy-load SheetJS to keep it out of the initial bundle
  const XLSX = await import('xlsx')

  let rawRows: Record<string, unknown>[]
  try {
    const workbook = XLSX.read(buffer, { type: 'array', raw: true })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const range: unknown = firstSheet['!ref']
    if (typeof range === 'string') {
      const { e: end, s: start } = XLSX.utils.decode_range(range)
      if (end.r - start.r > MAX_UPLOAD_ROWS) {
        throw new FileParseError(`File exceeds the ${MAX_UPLOAD_ROWS.toLocaleString()} row limit.`)
      }
    }
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: null })
  } catch (error) {
    if (error instanceof FileParseError) throw error
    throw new FileParseError(
      'Could not read file. Ensure it is a valid .xlsx, .xls, or .csv file.',
    )
  }

  if (!rawRows || rawRows.length === 0) {
    throw new FileParseError('File contains no data rows')
  }

  const headers = Object.keys(rawRows[0])
  const columnMapping = resolveColumnMapping(headers)
  const rows = parseRows(rawRows, columnMapping)
  const fileHash = await computeFileHash(buffer)

  return { rows, fileName: file.name, fileHash }
}

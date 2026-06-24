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
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
  }

  const str = stringify(value).trim()

  // 1. ISO date (optionally with a time component) -> take the date part verbatim.
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(str)
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  }

  // 2. Numeric day/month/year separated by / or - (India convention: DD/MM/YYYY).
  const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(str)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2])
    const year = Number(dmyMatch[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`
    }
  }

  // 3. Fallback (text months like "15-Mar-2024" / "Mar 15 2024"): these parse
  // as LOCAL midnight, so read LOCAL components to recover the intended day
  // (reading UTC here would shift the day back for positive-offset users).
  const parsed = new Date(str)
  if (Number.isNaN(parsed.getTime())) {
    throw new FileParseError(`Row ${rowIndex}: Could not parse date '${str}'`)
  }
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`
}

function parseAmount(value: unknown, rowIndex: number): number {
  if (value == null || value === '') {
    throw new FileParseError(`Row ${rowIndex}: Amount is missing`)
  }

  const num = typeof value === 'number' ? value : Number.parseFloat(stringify(value).replaceAll(',', ''))
  if (Number.isNaN(num)) {
    throw new FileParseError(`Row ${rowIndex}: Amount must be a number, got '${stringify(value)}'`)
  }
  return Math.round(Math.abs(num) * 100) / 100
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

  const rows: ParsedTransaction[] = []

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]
    const rowNum = i + 2 // 1-indexed + header row

    const date = parseDate(raw[columnMapping.date], rowNum)
    const amount = parseAmount(raw[columnMapping.amount], rowNum)
    const type = parseType(raw[columnMapping.type], rowNum)
    const account = stringify(raw[columnMapping.account]).trim()
    const category = stringify(raw[columnMapping.category]).trim()

    if (!account) throw new FileParseError(`Row ${rowNum}: Account is missing`)
    if (!category) throw new FileParseError(`Row ${rowNum}: Category is missing`)

    const currency = columnMapping.currency
      ? trimOrUndefined(raw[columnMapping.currency]) ?? 'INR'
      : 'INR'

    rows.push({
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
    })
  }

  return rows
}

export async function parseFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()

  if (buffer.byteLength === 0) {
    throw new FileParseError('File is empty')
  }

  // Lazy-load SheetJS to keep it out of the initial bundle
  const XLSX = await import('xlsx')

  let rawRows: Record<string, unknown>[]
  try {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet)
  } catch {
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

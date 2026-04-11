/**
 * Client-side Excel/CSV parser.
 *
 * Reads a File via SheetJS, maps flexible column names to standard fields,
 * validates required data, and returns structured rows ready for the backend.
 */

import { COLUMN_MAPPINGS, REQUIRED_COLUMNS, VALID_TYPES } from '@/constants/columns'

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

function parseDate(value: unknown, rowIndex: number): string {
  if (value == null || value === '') {
    throw new FileParseError(`Row ${rowIndex}: Date is missing`)
  }

  if (typeof value === 'number') {
    // SheetJS Excel serial date number
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const date = new Date(epoch.getTime() + value * 86400000)
    return date.toISOString().split('T')[0]
  }

  const str = String(value).trim()
  const parsed = new Date(str)
  if (Number.isNaN(parsed.getTime())) {
    throw new FileParseError(`Row ${rowIndex}: Could not parse date '${str}'`)
  }
  return parsed.toISOString().split('T')[0]
}

function parseAmount(value: unknown, rowIndex: number): number {
  if (value == null || value === '') {
    throw new FileParseError(`Row ${rowIndex}: Amount is missing`)
  }

  const num = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, ''))
  if (Number.isNaN(num)) {
    throw new FileParseError(`Row ${rowIndex}: Amount must be a number, got '${value}'`)
  }
  return Math.round(Math.abs(num) * 100) / 100
}

function parseType(value: unknown, rowIndex: number): string {
  if (value == null || value === '') {
    throw new FileParseError(`Row ${rowIndex}: Transaction type is missing`)
  }

  const raw = String(value).trim()
  if (!VALID_TYPES.has(raw.toLowerCase())) {
    throw new FileParseError(
      `Row ${rowIndex}: Unknown transaction type '${raw}'. Expected: Income, Expense, Transfer-In, Transfer-Out`,
    )
  }
  return raw
}

function trimOrUndefined(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  const trimmed = String(value).trim()
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
    const account = String(raw[columnMapping.account] ?? '').trim()
    const category = String(raw[columnMapping.category] ?? '').trim()

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

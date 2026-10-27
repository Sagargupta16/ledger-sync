/**
 * Normalize a decrypted AIS (Annual Information Statement) document into flat
 * rows, entirely in the browser. Decryption lives in `aisDecrypt.ts`.
 *
 * Ported from the on-device `parse_ais` of community/itr-agent
 * (`src/parsers/ais.ts`, `parseAisDocument`; MIT License, copyright 2026
 * Sagar Gupta). Two changes: the taxpayer block (PAN, name, contact details)
 * is read only for the statement's year and never returned, and every cell,
 * source, title and code is masked (`maskAisValue`, `maskPans`) before it
 * leaves this module.
 */

import { taxYearKey } from '@/lib/tax-config/taxYear'

import { maskAisValue, maskPans, parseAisDate } from './aisFields'

export type AisLevel = 'l1' | 'l2' | 'element'

export interface AisRow {
  /** Running index of the element the row came from, so callers can use one level per element. */
  element: number
  sectionTitle: string
  elementTitle: string
  /** Element-level information code ("TDS-192", "SFT-016") when the export carries one. */
  elementCode: string
  source: string
  /** Which table level the row came from (l1/l2/element). */
  level: AisLevel
  fields: Record<string, string>
  /** ISO "YYYY-MM-DD" when the row's first date column parses. */
  date?: string
  code?: string
}

export interface AisParsed {
  rows: AisRow[]
  warnings: string[]
  /** "2024-25" from the statement's financial or assessment year, else the year most row dates fall in. */
  taxYear: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const cellText = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''

/** Labels appear both as plain strings and as {name} objects. */
const labelText = (label: unknown): string => (isRecord(label) ? cellText(label.name) : cellText(label))

/**
 * Read a column table defensively: every field can be absent, null, or the
 * wrong type, and layout surprises must degrade to fewer rows, never a throw.
 */
function tableRows(table: unknown): Record<string, string>[] {
  if (!isRecord(table) || !Array.isArray(table.columnLabel) || !Array.isArray(table.columnData)) return []
  const labels = table.columnLabel.map(labelText)
  const out: Record<string, string>[] = []
  for (const row of table.columnData) {
    if (!Array.isArray(row)) continue
    const record: Record<string, string> = {}
    // Walk the ROW, not the label list: a hostile file can declare 200k labels
    // against one-cell rows, and cells past the row's own length carry no data.
    const width = Math.min(row.length, labels.length)
    for (let i = 0; i < width; i++) {
      const value = cellText(row[i])
      if (labels[i] && value !== '') record[labels[i]] = maskAisValue(labels[i], value)
    }
    if (Object.keys(record).length > 0) out.push(record)
  }
  return out
}

const DATE_RE = /date/i
const CODE_RE = /information code|sft code|^section$/i

function enrich(row: Record<string, string>): Pick<AisRow, 'date' | 'code'> {
  const out: Pick<AisRow, 'date' | 'code'> = {}
  for (const [label, value] of Object.entries(row)) {
    if (out.date === undefined && DATE_RE.test(label)) out.date = parseAisDate(value)
    if (out.code === undefined && CODE_RE.test(label)) out.code = value
  }
  return out
}

/** "2024-25" from "2024-25", "2024-2025" or "FY 2024-25", shifted back a year for an AY. */
function yearFrom(value: string, offset: number): string | null {
  const match = /(20\d{2})\s*-\s*(?:20)?(\d{2})(?!\d)/.exec(value)
  if (!match || (Number(match[1]) + 1) % 100 !== Number(match[2])) return null
  return taxYearKey(Number(match[1]) + offset)
}

function statementYear(doc: Record<string, unknown>): string | null {
  const pairs: [string, string][] = []
  for (const key of ['partA', 'header']) {
    for (const row of tableRows(doc[key])) {
      const entries = Object.entries(row)
      pairs.push(...entries)
      // Some exports transpose the table as Field/Value pairs.
      if (entries.length === 2) pairs.push([entries[0][1], entries[1][1]])
    }
  }
  for (const source of [doc, doc.metadata]) {
    if (isRecord(source)) for (const [key, value] of Object.entries(source)) pairs.push([key, cellText(value)])
  }
  for (const [label, value] of pairs) {
    let year: string | null = null
    if (/financial\s*year|^\s*f\.?y\.?\s*$/i.test(label)) year = yearFrom(value, 0)
    else if (/assessment\s*year|^\s*a\.?y\.?\s*$/i.test(label)) year = yearFrom(value, -1)
    if (year) return year
  }
  return null
}

/** The April-March year most row dates fall in. */
function yearFromDates(rows: readonly AisRow[]): string | null {
  const counts = new Map<number, number>()
  for (const row of rows) {
    if (!row.date) continue
    const year = Number(row.date.slice(0, 4))
    const start = Number(row.date.slice(5, 7)) >= 4 ? year : year - 1
    counts.set(start, (counts.get(start) ?? 0) + 1)
  }
  let best: number | null = null
  for (const [start, count] of counts) if (best === null || count > (counts.get(best) ?? 0)) best = start
  return best === null ? null : taxYearKey(best)
}

/** Every row of one element, across its l1, l2 and element-level tables. Titles and codes are PAN-masked like cells. */
function elementRows(sectionTitle: string, element: Record<string, unknown>, index: number): AisRow[] {
  const elementTitle = maskPans(cellText(element.title))
  const elementCode = maskPans(cellText(element.code ?? element.infoCode ?? element.informationCode))
  // A level without its own source label belongs to the element's other one.
  const l1Src = cellText(element.l1Src)
  const l2Src = cellText(element.l2Src)
  const levels: [AisLevel, unknown, string][] = [
    ['l1', element.l1, l1Src || l2Src],
    ['l2', element.l2, l2Src || l1Src],
    ['element', element.l1 || element.l2 ? undefined : element, l1Src || l2Src],
  ]
  const out: AisRow[] = []
  for (const [level, table, source] of levels) {
    const maskedSource = maskAisValue('source', source)
    for (const fields of tableRows(table)) {
      out.push({
        element: index, sectionTitle, elementTitle, elementCode, source: maskedSource, level, fields, ...enrich(fields),
      })
    }
  }
  return out
}

/** Normalize a decrypted AIS document into flat rows matched by column label, never position. */
export function parseAisDocument(doc: unknown): AisParsed {
  if (!isRecord(doc)) {
    return { rows: [], taxYear: null, warnings: ['The opened file is not a JSON object, so it has no AIS rows.'] }
  }
  const warnings: string[] = []
  const partB = isRecord(doc.partB) ? doc.partB : {}
  const sections = Array.isArray(partB.sections) ? partB.sections : []
  if (partB.sections !== undefined && !Array.isArray(partB.sections)) {
    warnings.push('Part B is not laid out as a list of sections, so nothing could be read from it.')
  } else if (sections.length === 0) {
    warnings.push('Part B has no sections, so the statement lists no information rows.')
  }

  const rows: AisRow[] = []
  let elementIndex = 0
  for (const section of sections) {
    if (!isRecord(section)) continue
    const sectionTitle = maskPans(cellText(section.title))
    const elements = Array.isArray(section.elements) ? section.elements : []
    for (const element of elements) {
      if (!isRecord(element)) continue
      // One push per row, not a spread: a hostile file can put 100k+ rows in one element.
      for (const row of elementRows(sectionTitle, element, elementIndex++)) rows.push(row)
    }
  }
  return { rows, warnings, taxYear: statementYear(doc) ?? yearFromDates(rows) }
}

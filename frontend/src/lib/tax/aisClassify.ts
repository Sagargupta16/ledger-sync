/**
 * Sort parsed AIS rows into the lines /tax/ais shows: TDS and TCS, SFT
 * interest and dividends, securities and mutual fund transactions, the salary
 * annexure, and everything else (tax payments, refunds, high-value SFT).
 *
 * The export repeats information at two table levels (l1/l2) whose roles are
 * not documented, so each element's lines come from ONE level: the one with
 * the most rows that carry an amount. A summary level is the sum of its detail
 * level, so either gives the same total; reading both would double it.
 * A computation aid, not tax advice.
 */

import {
  dateOf, descriptionOf, grossAmountOf, quantityOf, sectionOf, sourceNameOf, taxAmountOf,
} from './aisFields'
import type { AisLevel, AisRow } from './aisParser'
import type { AisHead, AisLine, AisSections } from './aisTypes'

/**
 * Where an element sits in the statement. `payment` is Payment of Taxes and
 * Demand and Refund: money moving between the taxpayer and the department,
 * never income. `other` is Other Information (the salary annexure, interest on
 * an income tax refund) and anything unrecognised.
 */
type Part = 'tds' | 'sft' | 'payment' | 'other'

const LEVEL_ORDER: readonly AisLevel[] = ['l2', 'l1', 'element']

/** The level with the most rows passing `has`; a tie keeps the earlier level. */
export function bestLevel(rows: readonly AisRow[], has: (row: AisRow) => boolean): AisRow[] {
  let best: AisRow[] = []
  for (const level of LEVEL_ORDER) {
    const candidate = rows.filter((row) => row.level === level && has(row))
    if (candidate.length > best.length) best = candidate
  }
  return best
}

export function elementGroups(rows: readonly AisRow[]): AisRow[][] {
  const groups = new Map<number, AisRow[]>()
  for (const row of rows) {
    const group = groups.get(row.element)
    if (group) group.push(row)
    else groups.set(row.element, [row])
  }
  return [...groups.values()]
}

export function partOf(row: AisRow): Part {
  const title = row.sectionTitle
  if (/\btds\b|\btcs\b|deducted at source|collected at source/i.test(title)) return 'tds'
  if (/\bsft\b|specified financial/i.test(title)) return 'sft'
  if (/payment of tax|taxes paid|demand|refund/i.test(title)) return 'payment'
  if (/other information/i.test(title)) return 'other'
  if (/\b(tds|tcs)\b/i.test(`${row.elementCode} ${row.code ?? ''}`)) return 'tds'
  return /\bsft\b/i.test(`${row.elementCode} ${row.code ?? ''}`) ? 'sft' : 'other'
}

const SECTION_RE = /(?<![0-9A-Z])(19[2-6](?:-?[A-Z]{1,3})?|206C(?:\s*\(\s*[0-9A-Z]+\s*\)|[A-Z]{0,2}))(?![0-9A-Z])/i
const INFO_CODE_RE = /SFT-?\s*\d{3}(?:\s*\([A-Z]+\))?/i

function firstMatch(re: RegExp, texts: readonly string[]): string {
  for (const value of texts) {
    const match = re.exec(value)
    if (match) return (match[1] ?? match[0]).toUpperCase().replaceAll(/\s/g, '')
  }
  return ''
}

/** Income head of a TDS section; null for an unknown one. 192A is an EPF withdrawal, not salary. */
function headFromSection(section: string): AisHead | null {
  if (!section) return null
  if (section === '192') return 'salary'
  if (section === '193' || section === '194A') return 'interest'
  if (section === '194' || section === '194K') return 'dividend'
  if (section === '194IA' || section === '194IC') return 'capital_gains'
  if (section === '194I' || section === '194IB') return 'rent'
  if (/^194[CDGHJMOR]$/.test(section)) return 'business'
  return 'other'
}

function headFromWords(text: string): AisHead {
  if (/salar/i.test(text)) return 'salary'
  if (/dividend/i.test(text)) return 'dividend'
  if (/interest/i.test(text)) return 'interest'
  if (/\brent/i.test(text)) return 'rent'
  if (/immovable|property/i.test(text)) return 'capital_gains'
  if (/professional|technical|commission|contract|brokerage|fees/i.test(text)) return 'business'
  return 'other'
}

function lineOf(row: AisRow, index: number, head: AisHead, code: string): AisLine {
  return {
    key: `${row.element}:${row.level}:${index}`,
    part: row.sectionTitle,
    head,
    code,
    description: descriptionOf(row.fields) ?? row.elementTitle,
    source: sourceNameOf(row.fields) ?? (row.source || row.elementTitle),
    date: dateOf(row.fields) ?? null,
    amount: grossAmountOf(row.fields) ?? 0,
    tax: taxAmountOf(row.fields) ?? null,
    quantity: quantityOf(row.fields) ?? null,
  }
}

const hasFigure = (row: AisRow) =>
  grossAmountOf(row.fields) !== undefined || taxAmountOf(row.fields) !== undefined

/**
 * A TDS/TCS line; `isTcs` sends 206C rows to their own list. A section found
 * on the row decides it; the words only break the tie when no section was
 * found, because a title such as "Tax Deducted/Collected at Source" names both.
 */
export function tdsLine(row: AisRow, index: number): { line: AisLine; isTcs: boolean } {
  const section = firstMatch(
    SECTION_RE, [sectionOf(row.fields) ?? '', row.code ?? '', row.elementCode, row.elementTitle],
  ).replaceAll('-', '')
  const isTcs = section ? section.startsWith('206C') : /\btcs\b/i.test(`${row.elementTitle} ${row.elementCode}`)
  const head = isTcs ? 'other' : (headFromSection(section) ?? headFromWords(`${row.elementTitle} ${descriptionOf(row.fields) ?? ''}`))
  return { line: lineOf(row, index, head, section), isTcs }
}

/** Rule 114E high-value records (property, forex, cash, cards, time deposits): not securities. */
const HIGH_VALUE_RE = /immovable|property|land|building|foreign|currency|forex|cash|draft|prepaid|credit\s*card|time\s*deposit/i
const SECURITIES_RE = /sale|sold|redempt|purchase|securit|shares|equity|mutual\s*fund|units|debenture|bond|off[-\s]?market/i

function addSft(out: AisSections, group: readonly AisRow[]) {
  bestLevel(group, hasFigure).forEach((row, index) => {
    const text = `${row.elementTitle} ${descriptionOf(row.fields) ?? ''} ${row.elementCode} ${row.code ?? ''}`
    const code = firstMatch(INFO_CODE_RE, [sectionOf(row.fields) ?? '', row.code ?? '', row.elementCode, row.elementTitle])
    if (/dividend/i.test(text)) out.dividends.push(lineOf(row, index, 'dividend', code))
    else if (/interest/i.test(text)) out.interest.push(lineOf(row, index, 'interest', code))
    else if (HIGH_VALUE_RE.test(text)) out.other.push(lineOf(row, index, 'other', code))
    else if (SECURITIES_RE.test(text)) {
      const isSale = /sale|sold|redempt/i.test(text)
      out.securities.push(lineOf(row, index, isSale ? 'capital_gains' : 'other', code))
    } else out.other.push(lineOf(row, index, 'other', code))
  })
}

/** Challans, demands and refunds: listed as they come, whatever words their titles hold ("interest u/s 234B"). */
function addPayments(out: AisSections, group: readonly AisRow[]) {
  bestLevel(group, hasFigure).forEach((row, index) => out.other.push(lineOf(row, index, 'other', '')))
}

function addOther(out: AisSections, group: readonly AisRow[]) {
  const first = group[0]
  const text = `${first.elementTitle} ${descriptionOf(first.fields) ?? ''}`
  if (/salar/i.test(text)) {
    group.forEach((row, index) => {
      out.salaryAnnexure.push({
        key: `${row.element}:${row.level}:${index}`,
        source: sourceNameOf(row.fields) ?? (row.source || row.elementTitle),
        description: row.elementTitle,
        fields: Object.entries(row.fields).map(([label, value]) => ({ label, value })),
      })
    })
    return
  }
  bestLevel(group, hasFigure).forEach((row, index) => {
    if (/dividend/i.test(text)) out.dividends.push(lineOf(row, index, 'dividend', ''))
    else if (/interest/i.test(text)) out.interest.push(lineOf(row, index, 'interest', ''))
    else out.other.push(lineOf(row, index, 'other', ''))
  })
}

/** Every AIS line, grouped the way /tax/ais shows them. */
export function classifyAisRows(rows: readonly AisRow[]): AisSections {
  const out: AisSections = { tds: [], tcs: [], interest: [], dividends: [], securities: [], salaryAnnexure: [], other: [] }
  for (const group of elementGroups(rows)) {
    const part = partOf(group[0])
    if (part === 'tds') {
      bestLevel(group, hasFigure).forEach((row, index) => {
        const { line, isTcs } = tdsLine(row, index)
        if (isTcs) out.tcs.push(line)
        else out.tds.push(line)
      })
    } else if (part === 'sft') addSft(out, group)
    else if (part === 'payment') addPayments(out, group)
    else addOther(out, group)
  }
  return out
}

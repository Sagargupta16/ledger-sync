/**
 * The per-tax-year totals an AIS supports, and the income lines the ledger is
 * checked against.
 *
 * TDS on salary is section 192; other TDS is every other TDS row. TCS is a
 * separate credit and is counted apart. Each element's tax and gross figures
 * come from the table level that carries them (see `bestLevel`).
 *
 * Interest and dividends often reach the AIS twice: as SFT information from
 * the bank or company, and as a TDS line from the same payer. Per payer the
 * larger of the two counts (the higher-of rule of community/itr-agent,
 * docs/v0.2-spec.md H4). That is a heuristic, exact only when one origin's
 * figure covers the other's, so both reported figures stay in
 * `summary.reported` for the page to show. A computation aid, not tax advice.
 */

import { bestLevel, classifyAisRows, elementGroups, partOf, tdsLine } from './aisClassify'
import { grossAmountOf, taxAmountOf } from './aisFields'
import type { AisParsed, AisRow } from './aisParser'
import type { AisLine, AisSections } from './aisTypes'

export interface AisSummary {
  tdsSalary: number
  tdsOther: number
  tcs: number
  interest: number
  dividends: number
  /** Gross interest and dividends as each origin reported them, before the per-payer rule. */
  reported: { interestSft: number; interestTds: number; dividendsSft: number; dividendsTds: number }
}

export interface AisStatement extends AisSections {
  taxYear: string | null
  summary: AisSummary
  /** Income lines compared with the ledger, with one origin per payer for interest and dividends. */
  incomeItems: AisLine[]
  /** Whether any TDS, TCS, interest, dividend, securities or salary line was read; false means the layout was not understood. */
  recognised: boolean
  warnings: string[]
  rowCount: number
}

type Origin = 'sft' | 'tds'
type PayerTotals = Map<string, Record<Origin, number>>

// Sum in paise so a long list of rupee-and-paise rows never drifts.
const paise = (rupees: number) => Math.round(rupees * 100)

/** TDS lines that are not income: 194N is TDS on cash withdrawals. */
const NOT_INCOME_SECTIONS = new Set(['194N'])

/** Payer name reduced so "HDFC BANK LTD (MUMH01234E)" and "HDFC Bank Limited" agree. */
export function payerKey(name: string): string {
  return name
    .toUpperCase()
    .replaceAll(/\([^)]*\)/g, ' ')
    .replaceAll(/\b[A-Z]{4}\d{5}[A-Z]\b/g, ' ')
    .replaceAll(/[^A-Z0-9 ]/g, ' ')
    .replaceAll(/\b(LIMITED|LTD|PVT|PRIVATE|THE|CO|COMPANY|INC)\b/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

const isSftLine = (line: AisLine) => /\bsft\b|specified financial/i.test(line.part) || line.code.startsWith('SFT')

function addPayer(totals: PayerTotals, source: string, origin: Origin, amount: number) {
  const key = payerKey(source)
  const entry = totals.get(key) ?? { sft: 0, tds: 0 }
  entry[origin] += paise(amount)
  totals.set(key, entry)
}

/**
 * Whether a payer's line counts: per payer only the origin with the larger
 * total does, SFT on a tie. A payer seen only on this line's side keeps it.
 */
function counts(totals: PayerTotals, line: AisLine, origin: Origin): boolean {
  const entry = totals.get(payerKey(line.source))
  if (!entry) return true
  return origin === 'sft' ? entry.sft >= entry.tds : entry.tds > entry.sft
}

function headTotal(totals: PayerTotals, otherLines: readonly AisLine[]): number {
  let total = otherLines.reduce((sum, line) => sum + paise(line.amount), 0)
  for (const entry of totals.values()) total += Math.max(entry.sft, entry.tds)
  return total / 100
}

const originTotal = (totals: PayerTotals, origin: Origin) =>
  [...totals.values()].reduce((sum, entry) => sum + entry[origin], 0) / 100

interface TdsFigures {
  /** Tax in paise. */
  tdsSalary: number
  tdsOther: number
  tcs: number
  /** Each payer's gross interest and dividends as its TDS lines reported them. */
  interest: PayerTotals
  dividends: PayerTotals
}

/** The TDS and TCS tax, and the TDS side of each payer's interest and dividends. */
function tdsFigures(rows: readonly AisRow[]): TdsFigures {
  const figures: TdsFigures = { tdsSalary: 0, tdsOther: 0, tcs: 0, interest: new Map(), dividends: new Map() }
  for (const group of elementGroups(rows)) {
    if (partOf(group[0]) !== 'tds') continue
    bestLevel(group, (row) => taxAmountOf(row.fields) !== undefined).forEach((row, index) => {
      const { line, isTcs } = tdsLine(row, index)
      const tax = paise(line.tax ?? 0)
      if (isTcs) figures.tcs += tax
      else if (line.head === 'salary') figures.tdsSalary += tax
      else figures.tdsOther += tax
    })
    bestLevel(group, (row) => grossAmountOf(row.fields) !== undefined).forEach((row, index) => {
      const { line, isTcs } = tdsLine(row, index)
      if (isTcs) return
      if (line.head === 'interest') addPayer(figures.interest, line.source, 'tds', line.amount)
      if (line.head === 'dividend') addPayer(figures.dividends, line.source, 'tds', line.amount)
    })
  }
  return figures
}

/** The income lines for the ledger comparison: one origin per payer for interest and dividends. */
function incomeItemsOf(sections: AisSections, interest: PayerTotals, dividends: PayerTotals): AisLine[] {
  const keep = (line: AisLine, origin: Origin) => {
    if (line.head === 'interest') return counts(interest, line, origin)
    if (line.head === 'dividend') return counts(dividends, line, origin)
    return true
  }
  return [
    ...sections.tds.filter((line) => !NOT_INCOME_SECTIONS.has(line.code) && keep(line, 'tds')),
    ...sections.interest.filter((line) => isSftLine(line) && keep(line, 'sft')),
    ...sections.dividends.filter((line) => isSftLine(line) && keep(line, 'sft')),
    ...sections.interest.filter((line) => !isSftLine(line)),
    ...sections.dividends.filter((line) => !isSftLine(line)),
  ].filter((line) => line.amount > 0)
}

const NOT_RECOGNISED_WARNING =
  'No TDS, SFT or salary information was recognised. The export layout may differ from what this page reads, so check the figures on the AIS portal.'

/** Whether any line of a kind this page reads (TDS, TCS, interest, dividends, securities, the salary annexure) was found. */
const isRecognised = (sections: AisSections) =>
  sections.tds.length + sections.tcs.length + sections.interest.length + sections.dividends.length
    + sections.securities.length + sections.salaryAnnexure.length > 0

/** Classify a parsed AIS and total it for one tax year. */
export function buildAisStatement(parsed: AisParsed): AisStatement {
  const sections = classifyAisRows(parsed.rows)
  const { tdsSalary, tdsOther, tcs, interest, dividends } = tdsFigures(parsed.rows)
  for (const line of sections.interest.filter(isSftLine)) addPayer(interest, line.source, 'sft', line.amount)
  for (const line of sections.dividends.filter(isSftLine)) addPayer(dividends, line.source, 'sft', line.amount)

  const recognised = isRecognised(sections)
  const warnings = [...parsed.warnings]
  if (parsed.rows.length > 0 && !recognised) warnings.push(NOT_RECOGNISED_WARNING)

  return {
    ...sections,
    taxYear: parsed.taxYear,
    summary: {
      tdsSalary: tdsSalary / 100,
      tdsOther: tdsOther / 100,
      tcs: tcs / 100,
      interest: headTotal(interest, sections.interest.filter((line) => !isSftLine(line))),
      dividends: headTotal(dividends, sections.dividends.filter((line) => !isSftLine(line))),
      reported: {
        interestSft: originTotal(interest, 'sft'),
        interestTds: originTotal(interest, 'tds'),
        dividendsSft: originTotal(dividends, 'sft'),
        dividendsTds: originTotal(dividends, 'tds'),
      },
    },
    incomeItems: incomeItemsOf(sections, interest, dividends),
    recognised,
    warnings,
    rowCount: parsed.rows.length,
  }
}

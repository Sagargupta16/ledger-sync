/**
 * Match AIS income lines against the ledger's income for the same tax year,
 * in both directions: AIS lines no ledger row accounts for (income the ledger
 * may have missed) and reportable ledger income with no AIS line.
 *
 * Salary matches by date only: the ledger holds take-home pay and the AIS the
 * gross, so the amounts never agree. Any other line matches one ledger row
 * whose amount equals its gross, or its gross less TDS, within 1% (at least
 * Rs 1), and whose date is within 10 days when the line has one. An interest
 * or dividend line still unmatched then matches one account's rows of that
 * kind whose sum agrees within 2% (at least Rs 10): quarterly credits against
 * an annual SFT figure. The matching itself is in `aisMatch.ts`. A computation
 * aid, not tax advice.
 */

import { classifyEmploymentIncome, phrasePattern } from '@/lib/finance/metricRules'
import type { IncomeClassification } from '@/store/preferencesTypes'
import type { Transaction } from '@/types'

import { bestRow, daysApart, matchingGroup } from './aisMatch'
import type { AisStatement } from './aisSummary'
import type { AisHead, AisLine, ReconLedgerRow } from './aisTypes'

export interface AisReconciliation {
  aisUnmatched: AisLine[]
  ledgerUnmatched: ReconLedgerRow[]
  aisCount: number
  ledgerCount: number
  /** AIS gross and ledger amount per head, for every head either side has. */
  heads: { head: AisHead; ais: number; ledger: number }[]
}

const SALARY_WINDOW_DAYS = 12

const INTEREST = phrasePattern(['interest'])
const DIVIDEND = phrasePattern(['dividend', 'dividends'])
const RENT = phrasePattern(['rent', 'rental'])
const GAINS = phrasePattern(['profit', 'profits', 'gain', 'gains', 'ltcg', 'stcg'])

const keyOf = (category: string, subcategory: string) =>
  `${category.trim().toLowerCase()}::${subcategory.trim().toLowerCase()}`
const keySet = (items: readonly string[]) =>
  new Set(items.map((item) => {
    const [category = '', ...rest] = item.split('::')
    return keyOf(category, rest.join('::'))
  }))

function kindOf(tx: Transaction): AisHead | null {
  if (classifyEmploymentIncome(tx)) return 'salary'
  for (const text of [`${tx.category} ${tx.subcategory ?? ''}`, tx.note ?? '']) {
    if (DIVIDEND?.test(text)) return 'dividend'
    if (INTEREST?.test(text)) return 'interest'
    if (RENT?.test(text)) return 'rent'
    if (GAINS?.test(text)) return 'capital_gains'
  }
  return null
}

const toRow = (tx: Transaction): ReconLedgerRow => ({
  id: tx.id,
  date: tx.date.slice(0, 10),
  amount: tx.amount,
  category: tx.category,
  subcategory: tx.subcategory ?? '',
  account: tx.account,
  note: tx.note ?? '',
  kind: kindOf(tx),
})

function headTotals(lines: readonly AisLine[], rows: readonly ReconLedgerRow[]): AisReconciliation['heads'] {
  const totals = new Map<AisHead, { ais: number; ledger: number }>()
  const entry = (head: AisHead) => {
    const found = totals.get(head)
    if (found) return found
    const created = { ais: 0, ledger: 0 }
    totals.set(head, created)
    return created
  }
  for (const line of lines) entry(line.head).ais += line.amount
  for (const row of rows) entry(row.kind ?? 'other').ledger += row.amount
  return [...totals.entries()].map(([head, value]) => ({ head, ...value }))
}

/** The AIS lines and ledger rows that have found each other. */
interface Matched {
  rows: Set<string>
  lines: Set<string>
}

/** Salary credits match by date; an annual salary figure or a sale covers whole kinds of ledger row. */
function matchSalaryAndSales(statement: AisStatement, rows: readonly ReconLedgerRow[], matched: Matched) {
  const items = statement.incomeItems
  const salaryRows = rows.filter((row) => row.kind === 'salary')
  for (const line of items.filter((item) => item.head === 'salary')) {
    const near = salaryRows.filter((row) => !line.date || daysApart(row.date, line.date) <= SALARY_WINDOW_DAYS)
    if (near.length === 0) continue
    matched.lines.add(line.key)
    for (const row of near) matched.rows.add(row.id)
  }
  // An annual salary figure (the annexure, or an undated line) covers every salary credit.
  if (statement.salaryAnnexure.length > 0 || items.some((item) => item.head === 'salary' && !item.date)) {
    for (const row of salaryRows) matched.rows.add(row.id)
  }
  // The AIS reports a sale's consideration, never its gain, so any sale covers recorded gains.
  if (statement.securities.some((line) => line.head === 'capital_gains')) {
    for (const row of rows) if (row.kind === 'capital_gains') matched.rows.add(row.id)
  }
}

/** Every non-salary line against a single credit first, then (interest and dividends) against one account's summed credits. */
function matchOtherLines(items: readonly AisLine[], rows: readonly ReconLedgerRow[], matched: Matched) {
  const others = items
    .filter((item) => item.head !== 'salary')
    .sort((a, b) => Number(!a.date) - Number(!b.date) || b.amount - a.amount)
  for (const line of others) {
    const pool = rows.filter((row) => !matched.rows.has(row.id) && (row.kind === null || row.kind === line.head))
    const row = bestRow(line, pool)
    if (!row) continue
    matched.lines.add(line.key)
    matched.rows.add(row.id)
  }
  // Annual (undated) figures are the real aggregates, so they claim groups first.
  const aggregates = others
    .filter((line) => !matched.lines.has(line.key) && (line.head === 'interest' || line.head === 'dividend'))
    .sort((a, b) => Number(!b.date) - Number(!a.date))
  for (const line of aggregates) {
    const group = matchingGroup(line, rows.filter((row) => !matched.rows.has(row.id) && row.kind === line.head))
    if (!group) continue
    matched.lines.add(line.key)
    for (const row of group) matched.rows.add(row.id)
  }
}

/** Compare one tax year's AIS income lines with the ledger's income rows for that year. */
export function reconcileAis(
  statement: AisStatement,
  ledger: readonly Transaction[],
  classification: IncomeClassification,
): AisReconciliation {
  const nonTaxable = keySet(classification.nonTaxable)
  const reportableKeys = keySet([...classification.taxable, ...classification.investmentReturns])
  const rows = ledger.filter((tx) => tx.type === 'Income' && tx.amount > 0).map(toRow)
  const reportable = rows.filter((row) => {
    const key = keyOf(row.category, row.subcategory)
    return !nonTaxable.has(key) && (row.kind !== null || reportableKeys.has(key))
  })
  const items = statement.incomeItems
  const matched: Matched = { rows: new Set(), lines: new Set() }
  matchSalaryAndSales(statement, rows, matched)
  matchOtherLines(items, rows, matched)

  return {
    aisUnmatched: items.filter((line) => !matched.lines.has(line.key)),
    ledgerUnmatched: reportable.filter((row) => !matched.rows.has(row.id)),
    aisCount: items.length,
    ledgerCount: reportable.length,
    heads: headTotals(items, reportable),
  }
}

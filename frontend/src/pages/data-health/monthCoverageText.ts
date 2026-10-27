/**
 * The month grid in words: the caption (also the grid's accessible name) and
 * each cell's hover text. The layout itself is built in `monthCoverage.ts`.
 */

import { formatMonthKey } from '@/lib/dateUtils'

import type { AccountCoverage, CheckMark, CoverageCell, CoverageState } from './monthCoverage'

/** Gap months named in the caption before the rest are only counted. */
const GAPS_NAMED = 6

function monthCount(n: number): string {
  return `${n} ${n === 1 ? 'month' : 'months'}`
}

function gapSentence(gaps: readonly string[]): string {
  if (gaps.length === 0) return 'No months missing in between.'
  const named = gaps.slice(0, GAPS_NAMED).map((month) => formatMonthKey(month)).join(', ')
  const rest = gaps.length > GAPS_NAMED ? ` and ${gaps.length - GAPS_NAMED} more` : ''
  return `No rows in ${named}${rest}.`
}

function checkSentence(checked: number, mismatched: number): string {
  if (checked === 0) return 'No balance checks yet.'
  const off = mismatched > 0 ? `, ${mismatched} off` : ''
  return `Balance checks in ${monthCount(checked)}${off}.`
}

/** Rows outside the drawn years, counted so a stray date is still visible in words. */
function undrawnSentence(coverage: AccountCoverage): string {
  const first = coverage.years.at(0)
  const last = coverage.years.at(-1)
  if (!first || !last) return ''
  const parts: string[] = []
  if (coverage.undrawnBefore > 0) {
    parts.push(`${monthCount(coverage.undrawnBefore)} with rows before ${first.year}`)
  }
  if (coverage.undrawnAfter > 0) {
    parts.push(`${monthCount(coverage.undrawnAfter)} with rows after ${last.year}`)
  }
  return parts.length > 0 ? `Not drawn: ${parts.join(' and ')}.` : ''
}

/**
 * The grid's caption, also its accessible name. It names the gap months in
 * text because a phone has no hover to read them off the cells.
 */
export function coverageSummary(coverage: AccountCoverage): string {
  const { firstMonth, lastMonth, rowMonths, spanMonths, gaps } = coverage
  const undrawn = undrawnSentence(coverage)
  let rows = ''
  if (firstMonth && lastMonth) {
    const range = `${formatMonthKey(firstMonth)} to ${formatMonthKey(lastMonth)}`
    rows = `Rows in ${rowMonths} of ${monthCount(spanMonths)}, ${range}. ${gapSentence(gaps)}`
  } else if (!undrawn) {
    rows = 'No rows for this account.'
  }
  const checks = checkSentence(coverage.checkedMonths, coverage.mismatchedMonths)
  return [rows, checks, undrawn].filter(Boolean).join(' ')
}

const CELL_BODY: Record<Exclude<CoverageState, 'rows'>, string> = {
  gap: 'no rows, a gap',
  outside: 'no rows',
  future: 'not yet',
}

const CHECK_SUFFIX: Record<Exclude<CheckMark, null>, string> = {
  matched: ', check matched',
  mismatch: ', check off',
}

/** Hover text for one cell. */
export function cellTitle(cell: CoverageCell): string {
  const body =
    cell.state === 'rows' ? `${cell.rows} ${cell.rows === 1 ? 'row' : 'rows'}` : CELL_BODY[cell.state]
  return `${formatMonthKey(cell.month)}: ${body}${cell.check ? CHECK_SUFFIX[cell.check] : ''}`
}

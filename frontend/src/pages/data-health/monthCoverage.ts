/**
 * Month-by-month coverage for one account, laid out as calendar years.
 *
 * A month with rows is covered. A month with none between the account's first
 * and last row is a gap: either the account was quiet or an import missed it,
 * and only the user knows which. Months that hold a balance check carry a mark,
 * red when any check that month disagreed with the ledger.
 *
 * At most `MAX_YEARS` calendar years are drawn, ending with the current one,
 * so a stray row date (a 1900 or 2099 typo) cannot grow the grid; the caption
 * (`monthCoverageText.ts`) counts the months it leaves out.
 */

import { monthKeysBetween } from '@/lib/dateUtils'
import type { AccountBalanceHealth } from '@/services/api/balanceChecks'

/** `outside`: before the first row or after the last, up to this month. */
export type CoverageState = 'rows' | 'gap' | 'outside' | 'future'
export type CheckMark = 'matched' | 'mismatch' | null

export interface CoverageCell {
  /** `YYYY-MM` */
  readonly month: string
  readonly state: CoverageState
  readonly rows: number
  readonly check: CheckMark
}

export interface CoverageYear {
  readonly year: number
  /** Always twelve cells, January first. */
  readonly cells: readonly CoverageCell[]
}

export interface AccountCoverage {
  readonly years: readonly CoverageYear[]
  /** The first and last drawn months with rows. */
  readonly firstMonth: string | null
  readonly lastMonth: string | null
  /** Drawn months with at least one row. */
  readonly rowMonths: number
  /** Months from the first drawn row to the last, inclusive. */
  readonly spanMonths: number
  readonly gaps: readonly string[]
  readonly checkedMonths: number
  readonly mismatchedMonths: number
  /** Months with rows before the first drawn year, and after the last. */
  readonly undrawnBefore: number
  readonly undrawnAfter: number
}

/** Calendar years the grid draws at most. */
const MAX_YEARS = 15

interface YearWindow {
  readonly from: number
  readonly to: number
}

const yearOf = (month: string) => Number(month.slice(0, 4))

function checkMarks(health: AccountBalanceHealth): Map<string, CheckMark> {
  const marks = new Map<string, CheckMark>()
  for (const check of health.checks) {
    const month = check.check_date.slice(0, 7)
    if (!check.matches) marks.set(month, 'mismatch')
    else if (!marks.has(month)) marks.set(month, 'matched')
  }
  return marks
}

/**
 * From the first year with rows or a check among the last `MAX_YEARS` through
 * this year; just this year when every such month falls outside them. `null`
 * when there is nothing at all.
 */
function yearWindow(months: readonly string[], currentYear: number): YearWindow | null {
  if (months.length === 0) return null
  const floor = currentYear - MAX_YEARS + 1
  const recent = months.map(yearOf).filter((year) => year >= floor && year <= currentYear)
  return { from: recent.length > 0 ? Math.min(...recent) : currentYear, to: currentYear }
}

function yearRows(window: YearWindow, cell: (month: string) => CoverageCell): CoverageYear[] {
  const years: CoverageYear[] = []
  for (let year = window.from; year <= window.to; year += 1) {
    const cells = Array.from({ length: 12 }, (_, index) =>
      cell(`${year}-${String(index + 1).padStart(2, '0')}`),
    )
    years.push({ year, cells })
  }
  return years
}

const EMPTY_COVERAGE: AccountCoverage = {
  years: [],
  firstMonth: null,
  lastMonth: null,
  rowMonths: 0,
  spanMonths: 0,
  gaps: [],
  checkedMonths: 0,
  mismatchedMonths: 0,
  undrawnBefore: 0,
  undrawnAfter: 0,
}

/** `asOf` is the summary's IST day; months after it are `future` unless dated rows sit there. */
export function buildAccountCoverage(health: AccountBalanceHealth, asOf: string): AccountCoverage {
  const allMarks = checkMarks(health)
  const known = [...health.months.map((entry) => entry.month), ...allMarks.keys()]
  const window = yearWindow(known, yearOf(asOf))
  // An account with neither rows nor checks has no years to draw.
  if (!window) return EMPTY_COVERAGE
  const drawn = (month: string) => yearOf(month) >= window.from && yearOf(month) <= window.to
  const months = health.months.filter((entry) => drawn(entry.month))
  const rows = new Map(months.map((entry) => [entry.month, entry.rows]))
  const marks = new Map([...allMarks].filter(([month]) => drawn(month)))
  const firstMonth = months.at(0)?.month ?? null
  const lastMonth = months.at(-1)?.month ?? null
  const span = firstMonth && lastMonth ? monthKeysBetween(firstMonth, lastMonth) : []

  const stateOf = (month: string): CoverageState => {
    if (rows.has(month)) return 'rows'
    if (firstMonth && lastMonth && month > firstMonth && month < lastMonth) return 'gap'
    return month > asOf.slice(0, 7) ? 'future' : 'outside'
  }

  return {
    years: yearRows(window, (month) => ({
      month,
      state: stateOf(month),
      rows: rows.get(month) ?? 0,
      check: marks.get(month) ?? null,
    })),
    firstMonth,
    lastMonth,
    rowMonths: months.length,
    spanMonths: span.length,
    gaps: span.filter((month) => !rows.has(month)),
    checkedMonths: marks.size,
    mismatchedMonths: [...marks.values()].filter((mark) => mark === 'mismatch').length,
    undrawnBefore: health.months.filter((entry) => yearOf(entry.month) < window.from).length,
    undrawnAfter: health.months.filter((entry) => yearOf(entry.month) > window.to).length,
  }
}

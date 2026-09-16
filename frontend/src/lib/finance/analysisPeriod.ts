import { addMonthsToMonthKey, formatMonthKey, monthKeysBetween, toLocalDateKey } from '@/lib/dateUtils'
import { isCompleteMonth } from '@/lib/savingsRate'

export interface EarningEvidence {
  date: string
  amount: number
  type: string
  category: string
  subcategory?: string | null
}

export interface EarningStart {
  date: string | null
  source: 'saved' | 'inferred' | 'unknown'
}

function validDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  const [year, month, day] = value.split('-').map(Number)
  return Number.isFinite(parsed.getTime()) &&
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day
    ? value : null
}

/** The chart-cropping toggle deliberately has no bearing on earning statistics. */
export function resolveEarningStart(
  savedDate: string | null | undefined,
  rows: readonly EarningEvidence[],
  now: Date = new Date(),
): EarningStart {
  const saved = validDate(savedDate)
  if (saved) return { date: saved, source: 'saved' }
  const today = toLocalDateKey(now)
  let first: string | null = null
  for (const row of rows) {
    if (row.type !== 'Income' || !Number.isFinite(row.amount) || row.amount <= 0) continue
    const date = validDate(row.date.slice(0, 10))
    if (!date || date > today) continue
    // Classification is evidence; incidental words in a bank note are not.
    const classification = `${row.category} ${row.subcategory ?? ''}`
    if (/\b(?:gift|gifts|allowance|allowances|refund|refunds|reimbursement|reimbursements|cashback|scholarship|scholarships|interest|dividend|dividends)\b/i.test(classification)) continue
    if (!/\b(?:employment|salary|wages?|payroll|paycheck|stipend|freelance|freelancing|consulting)\b/i.test(classification)) continue
    if (!first || date < first) first = date
  }
  return { date: first, source: first ? 'inferred' : 'unknown' }
}

export interface AnalysisPeriod {
  months: string[]
  startDate: string | null
  endDate: string | null
}

interface PeriodOptions {
  earningStartDate?: string | null
  startDate?: string | null
  endDate?: string | null
  /** Current health uses exactly this many trailing calendar months at most. */
  recentMonths?: number
  now?: Date
}

/**
 * Calendar-month denominator, including empty/unemployed months after earning
 * begins. Never mutate or filter the source ledger. A selected historical end
 * stays historical; current health instead anchors on the last completed month.
 */
export function resolveAnalysisPeriod(
  monthKeys: readonly string[],
  { earningStartDate, startDate, endDate, recentMonths, now = new Date() }: PeriodOptions = {},
): AnalysisPeriod {
  const empty: AnalysisPeriod = { months: [], startDate: null, endDate: null }
  const currentMonth = toLocalDateKey(now).slice(0, 7)
  const observed = monthKeys.filter((key) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key) && key <= currentMonth)
    .sort((a, b) => a.localeCompare(b))
  if (!observed.length) return empty
  // Current health is strictly trailing. Existing selected charts keep their
  // shared last-calendar-day convention; this helper does not change controls.
  const lastComplete = !recentMonths && isCompleteMonth(currentMonth, now)
    ? currentMonth : addMonthsToMonthKey(currentMonth, -1)
  const requestedEnd = recentMonths ? lastComplete : (endDate?.slice(0, 7) ?? observed.at(-1)!)
  const end = requestedEnd < lastComplete ? requestedEnd : lastComplete
  let start = earningStartDate?.slice(0, 7) ?? observed[0]
  if (startDate && startDate.slice(0, 7) > start) start = startDate.slice(0, 7)
  if (recentMonths) {
    const recentStart = addMonthsToMonthKey(end, 1 - recentMonths)
    if (recentStart > start) start = recentStart
  }
  if (start > end) return empty
  const months = monthKeysBetween(start, end)
  const [year, month] = end.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    months,
    startDate: [`${start}-01`, earningStartDate ?? '', startDate ?? ''].sort((a, b) => a.localeCompare(b)).at(-1)!,
    endDate: `${end}-${lastDay}`,
  }
}

export function analysisPeriodLabel(period: AnalysisPeriod): string {
  if (!period.months.length) return 'No completed months in the earnings period'
  const first = formatMonthKey(period.months[0])
  const last = formatMonthKey(period.months.at(-1)!)
  return `${first} - ${last} · ${period.months.length} completed months`
}

/** Fill missing calendar buckets without reclassifying recorded income/spend. */
export function fillAnalysisMonths<T extends { month: string }>(
  rows: readonly T[],
  months: readonly string[],
  empty: (month: string) => T,
): T[] {
  const byMonth = new Map(rows.map((row) => [row.month, row]))
  return months.map((month) => byMonth.get(month) ?? empty(month))
}

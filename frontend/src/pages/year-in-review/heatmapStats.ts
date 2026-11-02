import { MONTHS_PER_YEAR, getTodayKey } from '@/lib/dateUtils'
import type { DayCell } from './components/DayOfWeekChart'
import { MONTHS_SHORT } from './types'

/**
 * Calendar-month indices (0-11) in display order: Jan..Dec for a calendar
 * year, FY start..FY end for a fiscal year.
 *
 * `accumulateStats` buckets by calendar month (`cell.month`), so an FY view
 * has to reorder BEFORE it slices off future months. Slicing calendar order
 * directly showed Jan-Jun for an Apr-Mar FY in September: three future zero
 * months charted, and Jul-Sep (real spending) dropped.
 */
export function periodMonthOrder(isFYMode: boolean, fiscalYearStartMonth: number): number[] {
  return Array.from({ length: 12 }, (_, i) => (isFYMode ? (fiscalYearStartMonth - 1 + i) % 12 : i))
}

/**
 * Calendar-month indices of the lowest- and highest-spend months, or -1.
 *
 * `excludeMonth` is the in-progress month: a month a few days old has barely
 * any spend yet, so it always "won" best month. Best only considers months
 * with spending (an empty month is no data, not frugality), and so does worst;
 * ties keep the earliest index, matching the previous `indexOf` behaviour.
 */
export function bestWorstMonths(
  monthlyExpense: readonly number[],
  excludeMonth: number | null,
): { best: number; worst: number } {
  let best = -1
  let worst = -1
  for (const [i, value] of monthlyExpense.entries()) {
    if (i === excludeMonth) continue
    if (value > 0 && (best < 0 || value < monthlyExpense[best])) best = i
    if (value > 0 && (worst < 0 || value > monthlyExpense[worst])) worst = i
  }
  return { best, worst }
}

function laterPeak(
  current: { date: string; amount: number },
  date: string,
  amount: number,
): { date: string; amount: number } {
  return amount > current.amount ? { date, amount } : current
}

/** Accumulate summary statistics from grid cells. */
export function accumulateStats(grid: DayCell[]) {
  // Days that have actually happened in the period. The grid spans the whole
  // calendar/fiscal year, so for the current year its tail is future-dated and
  // would inflate every total and any "X of N days" denominator. Stop at today.
  const todayStr = getTodayKey()
  let totalExpense = 0
  let totalIncome = 0
  // Sum of each day's net, which (from the rollups) already subtracts
  // classified realised losses -- so it is NOT totalIncome - totalExpense.
  let totalNet = 0
  let daysWithExpense = 0
  let elapsedDays = 0
  let biggestExpenseDay = { date: '', amount: 0 }
  let biggestIncomeDay = { date: '', amount: 0 }
  let streak = 0
  let maxStreak = 0
  // Days before the first recorded activity are not a no-spend streak.
  let started = false
  const monthlyExpense: number[] = Array.from({ length: 12 }, () => 0)
  const monthlyIncome: number[] = Array.from({ length: 12 }, () => 0)
  const monthlyNet: number[] = Array.from({ length: 12 }, () => 0)

  for (const cell of grid) {
    if (cell.date > todayStr) continue
    elapsedDays++
    totalExpense += cell.expense
    totalIncome += cell.income
    totalNet += cell.net
    monthlyExpense[cell.month] += cell.expense
    monthlyIncome[cell.month] += cell.income
    monthlyNet[cell.month] += cell.net

    if (cell.expense > 0) daysWithExpense++
    biggestExpenseDay = laterPeak(biggestExpenseDay, cell.date, cell.expense)
    biggestIncomeDay = laterPeak(biggestIncomeDay, cell.date, cell.income)

    if (cell.hasTx) started = true
    if (cell.expense > 0) {
      streak = 0
    } else if (started) {
      streak++
      if (streak > maxStreak) maxStreak = streak
    }
  }

  return {
    totalExpense,
    totalIncome,
    totalNet,
    daysWithExpense,
    elapsedDays,
    biggestExpenseDay,
    biggestIncomeDay,
    maxStreak,
    monthlyExpense,
    monthlyIncome,
    monthlyNet,
  }
}

/**
 * Per-month bars for the selected period, in display order and cut after the
 * month holding today (an FY view starts at its own first month).
 */
export function buildMonthlyBarData(
  stats: Pick<ReturnType<typeof accumulateStats>, 'monthlyExpense' | 'monthlyIncome' | 'monthlyNet'>,
  isFYMode: boolean,
  selectedYear: number,
  fiscalYearStartMonth: number,
) {
  const today = getTodayKey()
  const nowYear = Number(today.slice(0, 4))
  const nowMonth = Number(today.slice(5, 7)) - 1
  let cutoff = MONTHS_PER_YEAR
  if (isFYMode) {
    const fyStartYear = selectedYear
    const fyEndYear = selectedYear + 1
    const isCurrentFY =
      (nowYear === fyStartYear && nowMonth >= fiscalYearStartMonth - 1) ||
      (nowYear === fyEndYear && nowMonth < fiscalYearStartMonth - 1)
    if (isCurrentFY) {
      cutoff = ((nowMonth - (fiscalYearStartMonth - 1) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR) + 1
    }
  } else if (selectedYear === nowYear) {
    cutoff = nowMonth + 1
  }
  return periodMonthOrder(isFYMode, fiscalYearStartMonth).slice(0, cutoff).map((monthIndex) => {
    const spending = stats.monthlyExpense[monthIndex]
    const earning = stats.monthlyIncome[monthIndex]
    return {
      name: MONTHS_SHORT[monthIndex],
      Spending: spending,
      Earning: earning,
      // Net cash flow per month (positive = saved, negative = overspent),
      // after classified realised losses. Drives the overlay line on the
      // Monthly Breakdown chart so savings months stand out.
      Net: stats.monthlyNet[monthIndex],
    }
  })
}

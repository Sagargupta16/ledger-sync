import { colors } from '@/constants/colors'
import { MS_PER_DAY, toLocalDateKey } from '@/lib/dateUtils'
import type { DayCell } from './components/DayOfWeekChart'
import { MONTHS_SHORT, heatmapNeutral, heatmapRamps, type HeatmapMode } from './types'

export function getIntensityLevel(value: number, max: number): number {
  if (value === 0 || max === 0) return 0
  const ratio = value / max
  if (ratio < 0.15) return 1
  if (ratio < 0.35) return 2
  if (ratio < 0.6) return 3
  return 4
}

export type HeatmapSign = 'surplus' | 'deficit' | 'neutral'

export interface HeatmapSwatch {
  /** 0 = neutral/empty, 1-4 = increasing magnitude. */
  level: number
  /** Design-token colour: hue from the sign, intensity from the magnitude. */
  color: string
  sign: HeatmapSign
}

/**
 * Pick a cell's colour: INTENSITY from the magnitude, HUE from the sign.
 *
 * A net cash flow of -50k and +50k are equally extreme but opposite in
 * meaning, so they must not share a swatch. Magnitude-zero (and no-activity)
 * cells fall back to the neutral empty-cell stop.
 */
export function getHeatmapSwatch(mode: HeatmapMode, value: number, max: number): HeatmapSwatch {
  const level = getIntensityLevel(Math.abs(value), max)
  if (level === 0) return { level: 0, color: heatmapNeutral, sign: 'neutral' }
  const sign: HeatmapSign = value < 0 ? 'deficit' : 'surplus'
  return { level, color: heatmapRamps[mode][sign][level], sign }
}

const MODE_NOUN: Record<HeatmapMode, string> = {
  expense: 'spent',
  income: 'earned',
  net: 'net',
}

/**
 * Direction-explicit noun for a value in the active mode, for aria-labels and
 * tooltips. A negative net cash flow is a deficit and must never be announced
 * with savings-positive wording.
 */
export function heatmapValueNoun(mode: HeatmapMode, value: number): string {
  if (mode !== 'net') return MODE_NOUN[mode]
  return value < 0 ? 'net deficit' : 'net surplus'
}

/** Get monthly value for a given mode */
export function getMonthlyValue(
  mode: HeatmapMode,
  monthlyExpense: number[],
  monthlyIncome: number[],
  index: number,
): number {
  if (mode === 'expense') return monthlyExpense[index]
  if (mode === 'income') return monthlyIncome[index]
  return monthlyIncome[index] - monthlyExpense[index]
}

/**
 * Per-sign monthly maxima for a mode. `net` reports the largest surplus and the
 * largest deficit separately; `expense`/`income` are single-sign, so only the
 * surplus side is populated.
 */
export function getMonthlyMaxBySign(
  mode: HeatmapMode,
  monthlyExpense: number[],
  monthlyIncome: number[],
): { surplus: number; deficit: number } {
  if (mode === 'expense') return { surplus: Math.max(...monthlyExpense), deficit: 0 }
  if (mode === 'income') return { surplus: Math.max(...monthlyIncome), deficit: 0 }

  let surplus = 0
  let deficit = 0
  for (const [idx, inc] of monthlyIncome.entries()) {
    const net = inc - monthlyExpense[idx]
    if (net > surplus) surplus = net
    else if (-net > deficit) deficit = -net
  }
  return { surplus, deficit }
}

/**
 * Get max monthly value for a given mode (used for intensity scaling).
 *
 * ONE shared magnitude scale across both signs, not two independent ramps: a
 * -50k month and a +50k month are equally extreme so they must reach the same
 * intensity and differ only in hue, whereas independent scales would paint a
 * tiny best-surplus as dark as a catastrophic deficit.
 */
export function getMonthlyMax(
  mode: HeatmapMode,
  monthlyExpense: number[],
  monthlyIncome: number[],
): number {
  const { surplus, deficit } = getMonthlyMaxBySign(mode, monthlyExpense, monthlyIncome)
  return Math.max(surplus, deficit)
}

/** Get streak color based on streak length */
export function getStreakColor(maxStreak: number): string {
  if (maxStreak >= 14) return colors.app.purple
  if (maxStreak >= 7) return colors.app.blue
  return colors.app.green
}

/**
 * Build dayExpenses/dayIncomes/dayNets from pre-computed DailySummary rows.
 *
 * `expense` already holds classified realised losses out (a loss is not a
 * heavy SPENDING day) and `net` still subtracts them (the cash did leave), so
 * `net` is kept per day rather than re-derived as income minus expense. A row
 * without `net` falls back to that difference.
 */
export function aggregateFromDailySummaries(
  summaries: readonly { date: string; income: number; expense: number; net?: number }[],
  startStr: string,
  endStr: string,
) {
  const dayExpenses: Record<string, number> = {}
  const dayIncomes: Record<string, number> = {}
  const dayNets: Record<string, number> = {}

  for (const s of summaries) {
    if (s.date < startStr || s.date > endStr) continue
    if (s.expense > 0) dayExpenses[s.date] = s.expense
    if (s.income > 0) dayIncomes[s.date] = s.income
    const net = s.net ?? s.income - s.expense
    if (net !== 0) dayNets[s.date] = net
  }
  return { dayExpenses, dayIncomes, dayNets }
}

/**
 * Walk from startDate to endDate, producing one DayCell per day plus running maxes.
 *
 * `dayNets`, when given, is the day's net after classified realised losses;
 * without it a day's net is income minus expense.
 */
export function buildDayCells(
  startDate: Date,
  endDate: Date,
  dayExpenses: Record<string, number>,
  dayIncomes: Record<string, number>,
  dayNets?: Record<string, number>,
) {
  const todayStr = toLocalDateKey(new Date())
  const startDow = startDate.getDay()
  const cells: DayCell[] = []
  let mxE = 0
  let mxI = 0
  // Net maxima tracked per sign so the diverging ramp can be reasoned about
  // (and reported in the legend) instead of collapsing to one abs() figure.
  let mxNSurplus = 0
  let mxNDeficit = 0

  const current = new Date(startDate)
  while (current <= endDate) {
    // Local-component key so it matches this cell's getDay()/getMonth() and the
    // YYYY-MM-DD transaction keys; toISOString() would shift a day in IST.
    const dateStr = toLocalDateKey(current)
    const dayOffset = Math.floor((current.getTime() - startDate.getTime()) / MS_PER_DAY)
    const weekIndex = Math.floor((dayOffset + startDow) / 7)
    const exp = dayExpenses[dateStr] || 0
    const inc = dayIncomes[dateStr] || 0
    const net = dayNets ? (dayNets[dateStr] ?? 0) : inc - exp

    if (exp > mxE) mxE = exp
    if (inc > mxI) mxI = inc
    if (net > mxNSurplus) mxNSurplus = net
    else if (-net > mxNDeficit) mxNDeficit = -net

    cells.push({
      date: dateStr,
      expense: exp,
      income: inc,
      net,
      dayOfWeek: current.getDay(),
      weekIndex,
      month: current.getMonth(),
      isToday: dateStr === todayStr,
      hasTx: exp > 0 || inc > 0 || net !== 0,
    })
    current.setDate(current.getDate() + 1)
  }
  // ONE shared magnitude scale for net (max of both signs), not two independent
  // ramps: equal-magnitude surplus and deficit days must reach equal intensity
  // and differ only in hue, so the ramp stays comparable across the sign flip.
  return {
    cells,
    mxE,
    mxI,
    mxN: Math.max(mxNSurplus, mxNDeficit),
    mxNSurplus,
    mxNDeficit,
  }
}

/** Derive month labels positioned at their first Sunday occurrence. */
export function deriveMonthLabels(cells: DayCell[]) {
  const labels: { month: string; weekIndex: number }[] = []
  let prevMonth = -1
  for (const cell of cells) {
    if (cell.month !== prevMonth && cell.dayOfWeek === 0) {
      labels.push({ month: MONTHS_SHORT[cell.month], weekIndex: cell.weekIndex })
      prevMonth = cell.month
    }
  }
  const firstMonth = cells.length > 0 ? MONTHS_SHORT[cells[0].month] : 'Jan'
  if (labels.length === 0 || labels[0].month !== firstMonth) {
    labels.unshift({ month: firstMonth, weekIndex: 0 })
  }
  return labels
}

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
 * with spending (an empty month is no data, not frugality); ties keep the
 * earliest index, matching the previous `indexOf` behaviour.
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
    if (worst < 0 || value > monthlyExpense[worst]) worst = i
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
  // would inflate any "X of N days" denominator. Cap N at today.
  const todayStr = toLocalDateKey(new Date())
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
  const monthlyExpense: number[] = Array.from({ length: 12 }, () => 0)
  const monthlyIncome: number[] = Array.from({ length: 12 }, () => 0)
  const monthlyNet: number[] = Array.from({ length: 12 }, () => 0)

  for (const cell of grid) {
    if (cell.date <= todayStr) elapsedDays++
    totalExpense += cell.expense
    totalIncome += cell.income
    totalNet += cell.net
    monthlyExpense[cell.month] += cell.expense
    monthlyIncome[cell.month] += cell.income
    monthlyNet[cell.month] += cell.net

    if (cell.expense > 0) daysWithExpense++
    biggestExpenseDay = laterPeak(biggestExpenseDay, cell.date, cell.expense)
    biggestIncomeDay = laterPeak(biggestIncomeDay, cell.date, cell.income)

    if (cell.expense === 0 && cell.hasTx) {
      streak++
      if (streak > maxStreak) maxStreak = streak
    } else if (cell.expense > 0) {
      streak = 0
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

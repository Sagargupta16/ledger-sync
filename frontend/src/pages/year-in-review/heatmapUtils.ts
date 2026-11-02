import { colors } from '@/constants/colors'
import { MS_PER_DAY, toLocalDateKey, getTodayKey } from '@/lib/dateUtils'
import type { DayCell } from './components/DayOfWeekChart'
import { MONTHS_SHORT, heatmapNeutral, heatmapRamps, type HeatmapMode } from './types'

function getIntensityLevel(value: number, max: number): number {
  if (value === 0 || max === 0) return 0
  const ratio = value / max
  if (ratio < 0.15) return 1
  if (ratio < 0.35) return 2
  if (ratio < 0.6) return 3
  return 4
}

type HeatmapSign = 'surplus' | 'deficit' | 'neutral'

interface HeatmapSwatch {
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

/**
 * Get monthly value for a given mode. `monthlyNet` is each month's net after
 * classified realised losses; without it net falls back to income minus expense.
 */
export function getMonthlyValue(
  mode: HeatmapMode,
  monthlyExpense: number[],
  monthlyIncome: number[],
  index: number,
  monthlyNet?: readonly number[],
): number {
  if (mode === 'expense') return monthlyExpense[index]
  if (mode === 'income') return monthlyIncome[index]
  return monthlyNet?.[index] ?? monthlyIncome[index] - monthlyExpense[index]
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
  monthlyNet?: readonly number[],
): { surplus: number; deficit: number } {
  if (mode === 'expense') return { surplus: Math.max(...monthlyExpense), deficit: 0 }
  if (mode === 'income') return { surplus: Math.max(...monthlyIncome), deficit: 0 }

  let surplus = 0
  let deficit = 0
  for (const [idx, inc] of monthlyIncome.entries()) {
    const net = monthlyNet?.[idx] ?? inc - monthlyExpense[idx]
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
  monthlyNet?: readonly number[],
): number {
  const { surplus, deficit } = getMonthlyMaxBySign(mode, monthlyExpense, monthlyIncome, monthlyNet)
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
  const todayStr = getTodayKey()
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
    // Rounded: a local day is 23 or 25 hours across a DST change.
    const dayOffset = Math.round((current.getTime() - startDate.getTime()) / MS_PER_DAY)
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

// Moved to heatmapStats.ts; re-exported so existing imports keep working.
export { accumulateStats, bestWorstMonths, periodMonthOrder } from './heatmapStats'

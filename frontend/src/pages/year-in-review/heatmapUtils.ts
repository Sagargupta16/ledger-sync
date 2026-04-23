import { rawColors } from '@/constants/colors'
import type { DayCell } from './DayOfWeekChart'
import { MONTHS_SHORT, type HeatmapMode } from './types'

export function getIntensityLevel(value: number, max: number): number {
  if (value === 0 || max === 0) return 0
  const ratio = value / max
  if (ratio < 0.15) return 1
  if (ratio < 0.35) return 2
  if (ratio < 0.6) return 3
  return 4
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

/** Get max monthly value for a given mode (used for intensity scaling) */
export function getMonthlyMax(
  mode: HeatmapMode,
  monthlyExpense: number[],
  monthlyIncome: number[],
): number {
  if (mode === 'expense') return Math.max(...monthlyExpense)
  if (mode === 'income') return Math.max(...monthlyIncome)
  return Math.max(...monthlyIncome.map((inc, idx) => Math.abs(inc - monthlyExpense[idx])))
}

/** Get streak color based on streak length */
export function getStreakColor(maxStreak: number): string {
  if (maxStreak >= 14) return rawColors.app.purple
  if (maxStreak >= 7) return rawColors.app.blue
  return rawColors.app.green
}

/** Get streak dot color based on position in the streak */
export function getStreakDotColor(index: number): string {
  if (index < 7) return rawColors.app.green
  if (index < 14) return rawColors.app.blue
  return rawColors.app.purple
}

/** Aggregate per-day expense/income totals from transactions within a date range. */
export function aggregateDayTotals(
  transactions: { date: string; type: string; amount: number }[],
  startStr: string,
  endStr: string,
) {
  const dayExpenses: Record<string, number> = {}
  const dayIncomes: Record<string, number> = {}

  for (const tx of transactions) {
    const d = tx.date.substring(0, 10)
    if (d < startStr || d > endStr) continue

    if (tx.type === 'Expense') {
      dayExpenses[d] = (dayExpenses[d] || 0) + Math.abs(tx.amount)
    } else if (tx.type === 'Income') {
      dayIncomes[d] = (dayIncomes[d] || 0) + Math.abs(tx.amount)
    }
  }
  return { dayExpenses, dayIncomes }
}

/** Build dayExpenses/dayIncomes from pre-computed DailySummary rows. */
export function aggregateFromDailySummaries(
  summaries: { date: string; income: number; expense: number }[],
  startStr: string,
  endStr: string,
) {
  const dayExpenses: Record<string, number> = {}
  const dayIncomes: Record<string, number> = {}

  for (const s of summaries) {
    if (s.date < startStr || s.date > endStr) continue
    if (s.expense > 0) dayExpenses[s.date] = s.expense
    if (s.income > 0) dayIncomes[s.date] = s.income
  }
  return { dayExpenses, dayIncomes }
}

/** Walk from startDate to endDate, producing one DayCell per day plus running maxes. */
export function buildDayCells(
  startDate: Date,
  endDate: Date,
  dayExpenses: Record<string, number>,
  dayIncomes: Record<string, number>,
) {
  const todayStr = new Date().toISOString().substring(0, 10)
  const startDow = startDate.getDay()
  const cells: DayCell[] = []
  let mxE = 0
  let mxI = 0
  let mxN = 0

  const current = new Date(startDate)
  while (current <= endDate) {
    const dateStr = current.toISOString().substring(0, 10)
    const dayOffset = Math.floor((current.getTime() - startDate.getTime()) / 86400000)
    const weekIndex = Math.floor((dayOffset + startDow) / 7)
    const exp = dayExpenses[dateStr] || 0
    const inc = dayIncomes[dateStr] || 0
    const net = inc - exp

    if (exp > mxE) mxE = exp
    if (inc > mxI) mxI = inc
    const absNet = Math.abs(net)
    if (absNet > mxN) mxN = absNet

    cells.push({
      date: dateStr,
      expense: exp,
      income: inc,
      net,
      dayOfWeek: current.getDay(),
      weekIndex,
      month: current.getMonth(),
      isToday: dateStr === todayStr,
      hasTx: exp > 0 || inc > 0,
    })
    current.setDate(current.getDate() + 1)
  }
  return { cells, mxE, mxI, mxN }
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

/** Accumulate summary statistics from grid cells. */
export function accumulateStats(grid: DayCell[]) {
  let totalExpense = 0
  let totalIncome = 0
  let daysWithExpense = 0
  let biggestExpenseDay = { date: '', amount: 0 }
  let biggestIncomeDay = { date: '', amount: 0 }
  let streak = 0
  let maxStreak = 0
  const monthlyExpense: number[] = Array.from({ length: 12 }, () => 0)
  const monthlyIncome: number[] = Array.from({ length: 12 }, () => 0)

  for (const cell of grid) {
    totalExpense += cell.expense
    totalIncome += cell.income
    monthlyExpense[cell.month] += cell.expense
    monthlyIncome[cell.month] += cell.income

    if (cell.expense > 0) {
      daysWithExpense++
      if (cell.expense > biggestExpenseDay.amount) {
        biggestExpenseDay = { date: cell.date, amount: cell.expense }
      }
    }
    if (cell.income > biggestIncomeDay.amount) {
      biggestIncomeDay = { date: cell.date, amount: cell.income }
    }

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
    daysWithExpense,
    biggestExpenseDay,
    biggestIncomeDay,
    maxStreak,
    monthlyExpense,
    monthlyIncome,
  }
}

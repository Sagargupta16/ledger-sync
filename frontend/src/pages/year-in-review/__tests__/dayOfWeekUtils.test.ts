import { describe, expect, it } from 'vitest'

import type { DayCell } from '../components/DayOfWeekChart'
import { computeDayOfWeekAverages } from '../dayOfWeekUtils'

/** Build a full-calendar-year grid the way buildDayCells does, day by day. */
function buildYearGrid(
  year: number,
  spendOn: Record<string, number> = {},
  earnOn: Record<string, number> = {},
): DayCell[] {
  const cells: DayCell[] = []
  const cursor = new Date(year, 0, 1)
  const end = new Date(year, 11, 31)
  let offset = 0
  const startDow = cursor.getDay()

  while (cursor <= end) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    const date = `${y}-${m}-${d}`
    const expense = spendOn[date] ?? 0
    const income = earnOn[date] ?? 0
    cells.push({
      date,
      expense,
      income,
      net: income - expense,
      dayOfWeek: cursor.getDay(),
      weekIndex: Math.floor((offset + startDow) / 7),
      month: cursor.getMonth(),
      isToday: false,
      hasTx: expense > 0 || income > 0,
    })
    cursor.setDate(cursor.getDate() + 1)
    offset++
  }
  return cells
}

function countWeekday(grid: readonly DayCell[], dayOfWeek: number, upTo?: string): number {
  return grid.filter((c) => c.dayOfWeek === dayOfWeek && (!upTo || c.date <= upTo)).length
}

describe('computeDayOfWeekAverages', () => {
  const TODAY = '2026-07-27' // a Monday, mid-year

  it('divides by elapsed weekdays, not every cell in the year grid', () => {
    // The shipped defect: the CY2026 grid holds 52 Mondays but only 30 had
    // happened on 2026-07-27, so every "Avg Spending" bar read 1.73x too small.
    const grid = buildYearGrid(2026, { '2026-01-05': 3000, '2026-02-02': 3000 }) // both Mondays

    const totalMondays = countWeekday(grid, 1)
    const elapsedMondays = countWeekday(grid, 1, TODAY)
    expect(totalMondays).toBe(52)
    expect(elapsedMondays).toBe(30)

    const { data } = computeDayOfWeekAverages(grid, TODAY)
    const monday = data.find((d) => d.day === 'Mon')

    expect(monday?.spending).toBeCloseTo(6000 / elapsedMondays, 6)
    // Guard the regression directly: the old divisor is a different number.
    expect(monday?.spending).not.toBeCloseTo(6000 / totalMondays, 6)
  })

  it('keeps elapsed zero-spend days in the divisor', () => {
    // A Monday you spent nothing on is a real zero and must pull the average
    // down. Only future days are excluded.
    const grid = buildYearGrid(2026, { '2026-01-05': 3000 })
    const { data } = computeDayOfWeekAverages(grid, TODAY)
    expect(data.find((d) => d.day === 'Mon')?.spending).toBeCloseTo(3000 / 30, 6)
  })

  it('excludes future spend from the numerator too', () => {
    // A future-dated row would otherwise land in a bar with no matching divisor
    // bump, inflating that weekday.
    const grid = buildYearGrid(2026, { '2026-12-28': 50_000 }) // a Monday after TODAY
    const { data, insights } = computeDayOfWeekAverages(grid, TODAY)
    expect(data.find((d) => d.day === 'Mon')?.spending).toBe(0)
    expect(insights).toBeNull()
  })

  it('averages income on the same elapsed divisor', () => {
    const grid = buildYearGrid(2026, {}, { '2026-01-06': 9000 }) // a Tuesday
    const elapsedTuesdays = countWeekday(grid, 2, TODAY)
    expect(elapsedTuesdays).toBe(29)
    const { data } = computeDayOfWeekAverages(grid, TODAY)
    expect(data.find((d) => d.day === 'Tue')?.earning).toBeCloseTo(9000 / elapsedTuesdays, 6)
  })

  it('returns all seven days in Sun-to-Sat order even with no data', () => {
    const { data, insights } = computeDayOfWeekAverages([], TODAY)
    expect(data.map((d) => d.day)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
    expect(data.every((d) => d.spending === 0 && d.earning === 0)).toBe(true)
    expect(insights).toBeNull()
  })

  it('compares weekend and weekday per-day, not sum vs sum', () => {
    // 2 weekend days vs 5 weekday days: an equal per-day rate must read 0%.
    const grid = buildYearGrid(2026)
    const perDay = 100
    for (const cell of grid) {
      if (cell.date <= TODAY) cell.expense = perDay
    }
    const { insights } = computeDayOfWeekAverages(grid, TODAY)
    expect(insights?.weekendDelta).toBeCloseTo(0, 6)
  })

  it('names the biggest and smallest spending day', () => {
    const grid = buildYearGrid(2026, { '2026-01-03': 20_000, '2026-01-05': 500 }) // Sat, Mon
    const { insights } = computeDayOfWeekAverages(grid, TODAY)
    expect(insights?.topDay).toBe('Sat')
    expect(insights?.topAmount).toBeCloseTo(20_000 / countWeekday(grid, 6, TODAY), 6)
    expect(insights?.bottomDay).toBeDefined()
    expect(insights?.weekendDelta).toBeGreaterThan(0)
  })

  it('uses the whole grid once the period is fully in the past', () => {
    // A past year has no future tail, so nothing is dropped.
    const grid = buildYearGrid(2025, { '2025-01-06': 7000 }) // a Monday
    const totalMondays = countWeekday(grid, 1)
    const { data } = computeDayOfWeekAverages(grid, TODAY)
    expect(data.find((d) => d.day === 'Mon')?.spending).toBeCloseTo(7000 / totalMondays, 6)
  })
})

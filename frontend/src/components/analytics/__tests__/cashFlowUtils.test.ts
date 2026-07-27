import { describe, expect, it } from 'vitest'

import { buildForecast } from '@/components/analytics/cashFlowUtils'
import { daysInMonth } from '@/lib/dateUtils'

/**
 * Every case injects `now` explicitly. Reading the real clock would make these
 * pass on the 26th and fail on the 31st -- which is exactly the bug class under
 * test, so a clock-dependent test here is worse than no test.
 */

type MonthTotals = { income: number; expense: number; net_savings: number }

/** `[monthKey, income, expense]` rows -> the `/api/calculations/monthly-aggregation` shape. */
const monthly = (rows: Array<[string, number, number]>): Record<string, MonthTotals> =>
  Object.fromEntries(
    rows.map(([month, income, expense]) => [
      month,
      { income, expense, net_savings: income - expense },
    ]),
  )

/**
 * 26 July 2026. July has 31 days, so the month is genuinely in progress -- and
 * this is the day the old `getDate() < 25` heuristic started calling it complete.
 */
const DURING_JULY = new Date(2026, 6, 26)

/** 31 July 2026: the LAST calendar day, where every day of the month exists. */
const LAST_DAY_OF_JULY = new Date(2026, 6, 31)

/** Six flat complete months: zero growth, so the projection base is unambiguous. */
const FLAT_SIX = [
  ['2026-01', 100_000, 60_000],
  ['2026-02', 100_000, 60_000],
  ['2026-03', 100_000, 60_000],
  ['2026-04', 100_000, 60_000],
  ['2026-05', 100_000, 60_000],
  ['2026-06', 100_000, 60_000],
] satisfies Array<[string, number, number]>

/** Six complete months of steadily rising income against flat expenses. */
const RISING_SIX = [
  ['2026-01', 100_000, 60_000],
  ['2026-02', 102_000, 60_000],
  ['2026-03', 104_000, 60_000],
  ['2026-04', 106_000, 60_000],
  ['2026-05', 108_000, 60_000],
  ['2026-06', 110_000, 60_000],
] satisfies Array<[string, number, number]>

/**
 * The month in progress: fixed costs have debited but the largest inflow of the
 * month has not landed yet, so income reads as a small fraction of normal. Not a
 * statement about any particular user's pay date -- just an under-filled month.
 */
const PARTIAL_JULY: [string, number, number] = ['2026-07', 2_000, 40_000]

const historicalMonthsOf = (combined: Array<{ month: string; isForecast: boolean }>) =>
  combined.filter((p) => !p.isForecast).map((p) => p.month)

const forecastMonthsOf = (combined: Array<{ month: string; isForecast: boolean }>) =>
  combined.filter((p) => p.isForecast).map((p) => p.month)

describe('buildForecast partial-month handling', () => {
  it('excludes the in-progress month from the historical series', () => {
    const result = buildForecast(monthly([...FLAT_SIX, PARTIAL_JULY]), DURING_JULY)

    expect(result).not.toBeNull()
    const history = historicalMonthsOf(result!.combined)
    expect(history).not.toContain('2026-07')
    expect(history.at(-1)).toBe('2026-06')
  })

  it('seeds the projection from the last COMPLETE month, not the partial one', () => {
    // Flat history => zero growth => the first forecast point must reproduce the
    // last complete month exactly. Seeding from the 26-day July (income 2,000)
    // would put the first point near 2% of a normal month.
    const result = buildForecast(monthly([...FLAT_SIX, PARTIAL_JULY]), DURING_JULY)!
    const firstForecast = result.combined.find((p) => p.isForecast)

    expect(firstForecast?.forecastIncome).toBe(100_000)
    expect(firstForecast?.forecastExpense).toBe(60_000)
    expect(firstForecast?.forecastNet).toBe(40_000)
  })

  it('averages only complete months in the KPI figures', () => {
    const result = buildForecast(monthly([...FLAT_SIX, PARTIAL_JULY]), DURING_JULY)!

    expect(result.insights.avgIncome).toBe(100_000)
    expect(result.insights.avgExpense).toBe(60_000)
    expect(result.insights.avgSavings).toBe(40_000)
    expect(result.insights.trend).toBe('positive')
  })

  it('keeps the growth rate sign correct when the latest month is partial and tiny', () => {
    const result = buildForecast(monthly([...RISING_SIX, PARTIAL_JULY]), DURING_JULY)!

    // Rising 100k -> 110k over 5 steps is +2% per month.
    expect(result.insights.incomeGrowth).toBeGreaterThan(0)
    expect(result.insights.incomeGrowth).toBeCloseTo(2, 5)
    expect(result.insights.expenseGrowth).toBeCloseTo(0, 5)
  })

  it('does not invent a deficit warning or a negative 1-year projection', () => {
    const result = buildForecast(monthly([...RISING_SIX, PARTIAL_JULY]), DURING_JULY)!

    expect(result.insights.projectedSavings).toBeGreaterThan(0)
    expect(result.insights.monthsUntilNegative).toBeNull()
  })

  it('starts the forecast the month after the last complete one, covering the partial month', () => {
    const result = buildForecast(monthly([...FLAT_SIX, PARTIAL_JULY]), DURING_JULY)!
    const forecastMonths = forecastMonthsOf(result.combined)

    expect(result.forecastStartMonth).toBe('2026-07')
    expect(forecastMonths).toHaveLength(12)
    expect(forecastMonths[0]).toBe('2026-07')
    expect(forecastMonths.at(-1)).toBe('2027-06')
    // No forecast point may share a month key with an actual -- two points on one
    // x-axis tick is the duplicate-label bug the old month offset produced.
    const history = new Set(historicalMonthsOf(result.combined))
    expect(forecastMonths.filter((m) => history.has(m))).toEqual([])
  })
})

describe('buildForecast month-end boundary', () => {
  it('treats the last calendar day of a month as complete', () => {
    // Documented repo rule: a month is partial until its LAST day, so on the 31st
    // every calendar day exists and dropping July would delete a real month.
    expect(daysInMonth('2026-07')).toBe(31)

    const result = buildForecast(monthly([...FLAT_SIX, ['2026-07', 100_000, 60_000]]), LAST_DAY_OF_JULY)!

    expect(historicalMonthsOf(result.combined).at(-1)).toBe('2026-07')
    expect(result.forecastStartMonth).toBe('2026-08')
  })

  it('treats a past month as complete regardless of the day of the month', () => {
    // Same data, viewed from early August: nothing is in progress any more.
    const result = buildForecast(
      monthly([...FLAT_SIX, ['2026-07', 100_000, 60_000]]),
      new Date(2026, 7, 3),
    )!

    expect(historicalMonthsOf(result.combined).at(-1)).toBe('2026-07')
    expect(result.forecastStartMonth).toBe('2026-08')
  })
})

describe('buildForecast insufficient data', () => {
  it('returns null when dropping the in-progress month leaves fewer than 3 complete months', () => {
    const result = buildForecast(
      monthly([['2026-05', 100_000, 60_000], ['2026-06', 100_000, 60_000], PARTIAL_JULY]),
      DURING_JULY,
    )

    expect(result).toBeNull()
  })

  it('returns null for a single complete month plus the month in progress', () => {
    const result = buildForecast(
      monthly([['2026-06', 100_000, 60_000], PARTIAL_JULY]),
      DURING_JULY,
    )

    expect(result).toBeNull()
  })

  it('returns null for undefined monthly data', () => {
    expect(buildForecast(undefined, DURING_JULY)).toBeNull()
  })
})

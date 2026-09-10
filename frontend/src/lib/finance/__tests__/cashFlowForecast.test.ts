import { describe, expect, it } from 'vitest'

import {
  buildCashFlowForecast,
  type MonthlyCashFlowData,
} from '../cashFlowForecast'

const APRIL_START = new Date(2026, 3, 1)

function lossHistory(netSavings = 40_000): NonNullable<MonthlyCashFlowData> {
  return Object.fromEntries(['2026-01', '2026-02', '2026-03'].map((month) => [
    month,
    { income: 100_000, expense: 40_000, net_savings: netSavings },
  ]))
}

describe('observed cash flow and forecast scope', () => {
  it('preserves F10 observed net savings and separates consumption surplus from capital losses', () => {
    const result = buildCashFlowForecast(lossHistory(), APRIL_START)!

    expect(result.historical).toEqual(['2026-01', '2026-02', '2026-03'].map((month) => ({
      month,
      income: 100_000,
      expense: 40_000,
      netSavings: 40_000,
      consumptionSurplus: 60_000,
      capitalLosses: 20_000,
    })))
    expect(result.insights).toMatchObject({
      avgIncome: 100_000,
      avgExpense: 40_000,
      avgNetSavings: 40_000,
      avgConsumptionSurplus: 60_000,
      avgCapitalLosses: 20_000,
      projectedConsumptionSurplus: 720_000,
    })
    expect(result.assumptions).toMatchObject({
      projectedMeasure: 'consumption-surplus',
      capitalLosses: 'not-projected',
      rangeBasis: 'historical-consumption-surplus-variability',
    })
    expect(result.forecast).toHaveLength(12)
    expect(result.forecast[0]).toMatchObject({ month: '2026-04', consumptionSurplus: 60_000 })
    expect(result.forecast.at(-1)?.month).toBe('2027-03')
  })

  it.each([0, -5_000, 39_999.37])('uses the exact API value %s without fallback, clamping, or rounding', (netSavings) => {
    const result = buildCashFlowForecast(lossHistory(netSavings), APRIL_START)!

    expect(result.historical.every((month) => month.netSavings === netSavings)).toBe(true)
    expect(result.insights.avgNetSavings).toBeCloseTo(netSavings, 8)
    expect(result.insights.avgCapitalLosses).toBeCloseTo(60_000 - netSavings, 8)
  })

  it('keeps an observed loss visible even when consumption-only projections are positive', () => {
    const result = buildCashFlowForecast(lossHistory(-5_000), APRIL_START)!

    expect(result.insights.observedTrend).toBe('negative')
    expect(result.insights.avgNetSavings).toBe(-5_000)
    expect(result.insights.projectedConsumptionSurplus).toBe(720_000)
    expect(result.insights.monthsUntilConsumptionDeficit).toBeNull()
  })

  it('does not feed capital-loss volatility into a projection that excludes future losses', () => {
    const result = buildCashFlowForecast({
      '2026-01': { income: 100_000, expense: 40_000, net_savings: 50_000 },
      '2026-02': { income: 100_000, expense: 40_000, net_savings: 40_000 },
      '2026-03': { income: 100_000, expense: 40_000, net_savings: 30_000 },
    }, APRIL_START)!

    expect(result.insights.avgNetSavings).toBe(40_000)
    expect(result.forecast.every((month) => month.lower === 60_000 && month.upper === 60_000)).toBe(true)
  })

  it('uses consumption-surplus variability even when observed net savings are flat', () => {
    const result = buildCashFlowForecast({
      '2026-01': { income: 100_000, expense: 50_000, net_savings: 40_000 },
      '2026-02': { income: 100_000, expense: 40_000, net_savings: 40_000 },
      '2026-03': { income: 100_000, expense: 30_000, net_savings: 40_000 },
    }, APRIL_START)!

    expect(result.forecast[0]).toMatchObject({
      consumptionSurplus: 73_000,
      lower: 66_468,
      upper: 79_532,
      rangeWidth: 13_064,
    })
  })

  it('keeps a negative consumption forecast and its range below zero', () => {
    const result = buildCashFlowForecast({
      '2026-01': { income: 40_000, expense: 60_000, net_savings: -30_000 },
      '2026-02': { income: 40_000, expense: 60_000, net_savings: -30_000 },
      '2026-03': { income: 40_000, expense: 60_000, net_savings: -30_000 },
    }, APRIL_START)!

    expect(result.forecast[0]).toMatchObject({ consumptionSurplus: -20_000, lower: -20_000, upper: -20_000 })
    expect(result.insights.avgNetSavings).toBe(-30_000)
    expect(result.insights.projectedConsumptionSurplus).toBe(-240_000)
    expect(result.insights.monthsUntilConsumptionDeficit).toBe(1)
  })

  it('does not mutate API records or their insertion order', () => {
    const input = Object.freeze({
      '2026-03': Object.freeze({ income: 100_000, expense: 40_000, net_savings: 40_000 }),
      '2026-01': Object.freeze({ income: 100_000, expense: 40_000, net_savings: 40_000 }),
      '2026-02': Object.freeze({ income: 100_000, expense: 40_000, net_savings: 40_000 }),
    })
    const original = JSON.stringify(input)

    expect(buildCashFlowForecast(input, APRIL_START)?.basisMonths).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(JSON.stringify(input)).toBe(original)
  })
})

describe('completed-month policy', () => {
  it('excludes a partial month from history, averages, losses, and the forecast base', () => {
    const result = buildCashFlowForecast({
      ...lossHistory(),
      '2026-04': { income: 2_000, expense: 30_000, net_savings: -80_000 },
    }, new Date(2026, 3, 26))!

    expect(result.basisMonths).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(result.historical.at(-1)?.month).toBe('2026-03')
    expect(result.insights.avgNetSavings).toBe(40_000)
    expect(result.insights.avgCapitalLosses).toBe(20_000)
    expect(result.forecast[0]).toMatchObject({ month: '2026-04', income: 100_000, consumptionSurplus: 60_000 })
    expect(result.assumptions.completedMonthPolicy).toBe('exclude-current-month-until-its-last-calendar-day')
  })

  it.each([
    [2026, 28],
    [2024, 29],
  ])('includes February %s only on its final calendar day %s', (year, lastDay) => {
    const data = {
      [`${year - 1}-12`]: { income: 100_000, expense: 40_000, net_savings: 40_000 },
      [`${year}-01`]: { income: 100_000, expense: 40_000, net_savings: 40_000 },
      [`${year}-02`]: { income: 100_000, expense: 40_000, net_savings: 40_000 },
    }
    expect(buildCashFlowForecast(data, new Date(year, 1, lastDay - 1))).toBeNull()
    const result = buildCashFlowForecast(data, new Date(year, 1, lastDay))!
    expect(result.basisMonths).toHaveLength(3)
    expect(result.forecast[0].month).toBe(`${year}-03`)
  })

  it('uses only the most recent six complete observations for averages and trend', () => {
    const data = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
      `2026-${String(index + 1).padStart(2, '0')}`,
      index < 2
        ? { income: 1_000_000, expense: 0, net_savings: 1_000_000 }
        : { income: 100_000, expense: 40_000, net_savings: 40_000 },
    ]))
    const result = buildCashFlowForecast(data, new Date(2026, 8, 1))!

    expect(result.basisMonths).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])
    expect(result.insights).toMatchObject({ avgNetSavings: 40_000, avgCapitalLosses: 20_000, incomeGrowth: 0, expenseGrowth: 0 })
    expect(result.historical).toHaveLength(8)
  })

  it('requires three complete observations and handles missing data', () => {
    expect(buildCashFlowForecast(undefined, APRIL_START)).toBeNull()
    expect(buildCashFlowForecast({}, APRIL_START)).toBeNull()
    expect(buildCashFlowForecast({
      '2026-02': { income: 100_000, expense: 40_000, net_savings: 40_000 },
      '2026-03': { income: 100_000, expense: 40_000, net_savings: 40_000 },
    }, APRIL_START)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { buildHistoricalChartData } from '../projectionUtils'

describe('buildHistoricalChartData -- expectedValue benchmark', () => {
  it('omits expectedValue series shape when expectedReturn is 0 (each contribution just sums)', () => {
    const transfers = [
      { date: '2024-01-15', amount: 10000 },
      { date: '2024-02-15', amount: 10000 },
    ]
    const data = buildHistoricalChartData(transfers, 20000, 0)
    // At 0% expected return, expectedValue === cumulative invested.
    expect(data.at(-1)?.expectedValue).toBe(20000)
    expect(data[0].expectedValue).toBe(10000)
  })

  it('compounds each contribution from its own month at the monthly expected rate', () => {
    // Two 10k contributions, Jan and Feb; expected return 12% p.a. => 1%/month.
    // Feb point (here index = Feb): Jan contribution has been invested 1 month
    // (10000 * 1.01 = 10100), Feb contribution 0 months (10000). Total 20100.
    const transfers = [
      { date: '2024-01-15', amount: 10000 },
      { date: '2024-02-15', amount: 10000 },
    ]
    const data = buildHistoricalChartData(transfers, 20000, 12)
    expect(data[0].expectedValue).toBe(10000) // Jan: just invested
    expect(data.at(-1)?.expectedValue).toBe(20100) // Feb: 10000*1.01 + 10000
  })

  it('expectedValue grows with the gap since each SIP day across many months', () => {
    // Jan contribution only, viewed three months later (Apr). 3 months at 1%.
    const transfers = [
      { date: '2024-01-15', amount: 10000 },
      { date: '2024-04-15', amount: 10000 },
    ]
    const data = buildHistoricalChartData(transfers, 20000, 12)
    // Apr point: Jan grown 3 months (10000*1.01^3 ~= 10303) + Apr fresh 10000.
    const apr = data.at(-1)?.expectedValue ?? 0
    expect(apr).toBe(Math.round(10000 * 1.01 ** 3) + 10000)
  })

  it('keeps actual value anchored to the real current balance regardless of expected', () => {
    const transfers = [
      { date: '2024-01-15', amount: 10000 },
      { date: '2024-02-15', amount: 10000 },
    ]
    // Real balance 25000 (ahead of the 20100 expected at 12%).
    const data = buildHistoricalChartData(transfers, 25000, 12)
    expect(data.at(-1)?.value).toBe(25000)
    expect(data.at(-1)?.expectedValue).toBe(20100)
  })

  it('returns empty array for no transfers', () => {
    expect(buildHistoricalChartData([], 0, 12)).toEqual([])
  })
})

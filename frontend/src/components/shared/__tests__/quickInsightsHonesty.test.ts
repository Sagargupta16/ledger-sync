import { describe, expect, it } from 'vitest'

import { buildFunFacts, type FunFactsParams } from '../quickInsightsData'

/**
 * Locks the central-tendency copy of the shipped cards at the numbers the real
 * 8,181-row ledger produces on the all-time window:
 *   avg transaction   796.56 (mean)     median transaction 76.00   -> 10.5x
 *   avg daily spend  1443.19 (mean)     typical active day 407.00  -> 7.0x
 *   monthly burn    43930.72 (mean)     typical month    12599.49  -> 3.5x
 * The defect these guard: all three headline a mean while the label claimed or
 * implied "typical", so a user reading them was told their normal day costs
 * 1443 when half of the days money moved cost under 407.
 */

const icons = new Proxy({}, { get: () => () => null }) as never
const money = (n: number) => `Rs${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

const REAL_ALL_TIME: FunFactsParams = {
  topCategory: undefined,
  topIncomeSource: null,
  netCashback: 0,
  cashbackCount: 0,
  biggestTransaction: { amount: 180_494.55, category: 'Investment Expenses' },
  medianTransaction: 76,
  avgTransactionAmount: 796.56,
  avgDailySpending: 1443.19,
  daysInRange: 2768,
  weekendPercent: 0,
  weekendSpending: 0,
  weekdaySpending: 0,
  peakDay: { name: 'Monday', total: 0 },
  monthlyBurnRate: 43_930.72,
  monthsInRange: 90.93,
  medianSpendingDay: 407,
  medianSpendingMonth: 12_599.49,
  uniqueCategories: 12,
  uniqueSubcategories: 0,
  totalTransfers: 0,
  transferCount: 0,
  incomeExpenseRatio: 0,
  mostExpensiveMonth: null,
}

function subtitleOf(params: FunFactsParams, title: string): string {
  const card = buildFunFacts(params, icons, money).find((i) => i.title === title)
  if (!card) throw new Error(`no card titled "${title}"`)
  return card.subtitle ?? ''
}

describe('buildFunFacts central tendency', () => {
  it('states the mean daily rate AND the typical spending day', () => {
    expect(subtitleOf(REAL_ALL_TIME, 'Average Daily Spending')).toBe(
      'Total spend spread over 2768 days; typical spending day is Rs407',
    )
  })

  it('states the mean monthly burn AND the typical month', () => {
    expect(subtitleOf(REAL_ALL_TIME, 'Monthly Burn Rate')).toBe(
      'Mean over 90.9 months; typical month is Rs12,599',
    )
  })

  it('keeps the median in the Median Transaction headline and discloses the mean', () => {
    const card = buildFunFacts(REAL_ALL_TIME, icons, money).find(
      (i) => i.title === 'Median Transaction',
    )
    expect(card?.value).toBe('Rs76')
    expect(card?.subtitle).toBe('Typical spend. Skewed by big-ticket rows: mean is Rs797')
  })

  it('labels Avg Transaction as a mean and quotes the typical amount', () => {
    expect(subtitleOf(REAL_ALL_TIME, 'Avg Transaction')).toBe('Mean; 10x the typical Rs76')
  })

  it('never claims a typical figure it was not given', () => {
    const noSeries: FunFactsParams = {
      ...REAL_ALL_TIME,
      medianSpendingDay: null,
      medianSpendingMonth: null,
    }
    expect(subtitleOf(noSeries, 'Average Daily Spending')).toBe('Total spend spread over 2768 days')
    expect(subtitleOf(noSeries, 'Monthly Burn Rate')).toBe('Mean over 90.9 months')
  })

  it('drops the second number when spending is genuinely even', () => {
    const even: FunFactsParams = {
      ...REAL_ALL_TIME,
      avgTransactionAmount: 500,
      medianTransaction: 500,
      avgDailySpending: 1000,
      medianSpendingDay: 1000,
      monthlyBurnRate: 30_000,
      medianSpendingMonth: 30_000,
    }
    expect(subtitleOf(even, 'Average Daily Spending')).toBe('Total spend spread over 2768 days')
    expect(subtitleOf(even, 'Monthly Burn Rate')).toBe('Mean over 90.9 months')
    expect(subtitleOf(even, 'Median Transaction')).toBe('Spending is fairly even')
    expect(subtitleOf(even, 'Avg Transaction')).toBe('Per transaction')
  })

  it('keeps every card title stable, so Settings widget toggles keep matching', () => {
    const titles = buildFunFacts(REAL_ALL_TIME, icons, money).map((i) => i.title)
    expect(titles).toContain('Average Daily Spending')
    expect(titles).toContain('Monthly Burn Rate')
    expect(titles).toContain('Median Transaction')
    expect(titles).toContain('Avg Transaction')
  })
})

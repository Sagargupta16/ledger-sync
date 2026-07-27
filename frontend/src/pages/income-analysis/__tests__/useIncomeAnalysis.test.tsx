/**
 * Guards the partial-month split on the Income Analysis page.
 *
 * Salary lands near month-end, so on 2026-07-26 the real ledger had 9,911 of
 * July income against 225,835-267,000 for Apr-Jun. The backend's `growth_rate`
 * runs first-to-last over every month it is handed, which turned that stub into
 * a -95.6% "growth rate" (true, on completed months: +18.1%) and an average
 * monthly income of 181,968 (true: 239,320).
 *
 * The split the page must keep: the period TOTAL still counts the in-progress
 * month (money received so far is real), while the trend, average, peak and
 * growth rate cover completed months only.
 *
 * The reference date is injected via fake timers, not read from the clock.
 */

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useIncomeAnalysis } from '../useIncomeAnalysis'

/**
 * Apr-Jun are complete; July is 26 of 31 days in with only the stub credited.
 * Complete-months growth is +100% (100,000 -> 200,000) and the average 150,000;
 * including July gives -95% and 112,500. Two different worlds, one dataset.
 */
const INCOME_RESPONSE = {
  total_income: 460000,
  category_breakdown: { 'Employment Income': 450000, Interest: 10000 },
  // `income_avg_3m` is null until a full 3-month window exists, matching what
  // `_compute_income_analysis` now sends: Apr and May abstain, Jun is the first
  // real mean ((100+150+200)/3 = 150,000) and Jul is (150+200+10)/3 = 120,000.
  monthly_data: [
    { month: '2026-04', income: 100000, income_avg_3m: null },
    { month: '2026-05', income: 150000, income_avg_3m: null },
    { month: '2026-06', income: 200000, income_avg_3m: 150000 },
    { month: '2026-07', income: 10000, income_avg_3m: 120000 },
  ],
  cashbacks_total: 10000,
  // Both are what the backend computed over the window that includes July.
  peak_income: 200000,
  growth_rate: -90,
}

/**
 * One month of history, and it is the month in progress -- a user who has just
 * uploaded their first statement, on the shipped `all_time` default view.
 */
const JULY_ONLY_RESPONSE = {
  total_income: 10000,
  category_breakdown: { 'Employment Income': 10000 },
  monthly_data: [{ month: '2026-07', income: 10000, income_avg_3m: null }],
  cashbacks_total: 0,
  peak_income: 10000,
  growth_rate: 0,
}

const incomeResponseRef: {
  current: typeof INCOME_RESPONSE | typeof JULY_ONLY_RESPONSE
} = { current: INCOME_RESPONSE }

vi.mock('@/hooks/api/usePreferences', () => ({
  usePreferences: () => ({
    data: { fiscal_year_start_month: 4, non_taxable_income_categories: ['Cashback'] },
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/services/api/calculations', () => ({
  calculationsApi: {
    getIncomeAnalysis: vi.fn(async () => ({ data: incomeResponseRef.current })),
    getDataDateRange: vi.fn(async () => ({
      data: { min_date: '2026-04-01', max_date: '2026-07-26' },
    })),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('useIncomeAnalysis -- in-progress month', () => {
  beforeEach(() => {
    incomeResponseRef.current = INCOME_RESPONSE
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the partial month in the period total', async () => {
    const { result } = renderHook(() => useIncomeAnalysis(), { wrapper })
    await waitFor(() => expect(result.current.totalIncome).toBe(460000))
  })

  it('drops it from the trend, average and peak', async () => {
    const { result } = renderHook(() => useIncomeAnalysis(), { wrapper })
    await waitFor(() => expect(result.current.monthlyTrendData).toHaveLength(3))
    expect(result.current.monthlyTrendData.map((d) => d.month)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
    ])
    // 450,000 / 3 completed months. With July: 460,000 / 4 = 115,000.
    expect(result.current.avgIncome).toBe(150000)
    expect(result.current.peakIncome).toBe(200000)
  })

  it('counts only the rolling-average points that survive the partial-month drop', async () => {
    const { result } = renderHook(() => useIncomeAnalysis(), { wrapper })
    await waitFor(() => expect(result.current.monthlyTrendData).toHaveLength(3))
    // Apr/May carry no average and July's is dropped with the month, so exactly
    // one average point remains -- which recharts cannot stroke. The chart marks
    // it as a dot and the caption says so instead of promising a line.
    expect(result.current.rollingAvgPointCount).toBe(1)
    expect(result.current.rollingAvgMonths).toBe(3)
    expect(result.current.monthlyTrendData.map((d) => d.incomeAvg)).toEqual([
      undefined,
      undefined,
      150000,
    ])
  })

  it('counts two average points once a fourth complete month lands', async () => {
    vi.setSystemTime(new Date(2026, 6, 31))
    const { result } = renderHook(() => useIncomeAnalysis(), { wrapper })
    await waitFor(() => expect(result.current.monthlyTrendData).toHaveLength(4))
    expect(result.current.rollingAvgPointCount).toBe(2)
  })

  it('recomputes the growth rate instead of trusting the backend value', async () => {
    const { result } = renderHook(() => useIncomeAnalysis(), { wrapper })
    // 100,000 -> 200,000 across completed months. The backend sent -90.
    await waitFor(() => expect(result.current.growthRate).toBe(100))
  })

  it('surfaces the in-progress month so the exclusion is stated', async () => {
    const { result } = renderHook(() => useIncomeAnalysis(), { wrapper })
    await waitFor(() =>
      expect(result.current.partialPeriod).toEqual({
        monthKey: '2026-07',
        label: 'Jul 2026',
        daysElapsed: 26,
        daysTotal: 31,
      }),
    )
    // The FY window still holds Apr-Jun, so there IS something to compare.
    expect(result.current.noCompleteMonthBasis).toBe(false)
  })

  it('keeps every month once the current one completes', async () => {
    vi.setSystemTime(new Date(2026, 6, 31))
    const { result } = renderHook(() => useIncomeAnalysis(), { wrapper })
    await waitFor(() => expect(result.current.monthlyTrendData).toHaveLength(4))
    expect(result.current.partialPeriod).toBeNull()
    // Nothing is hidden once the month is real: 100,000 -> 10,000 is -90%, which
    // is exactly what the backend computed over the same four months.
    expect(result.current.growthRate).toBe(-90)
    expect(result.current.avgIncome).toBe(115000)
  })
})

/**
 * The whole history is the month in progress. Dropping it left an empty series,
 * which made the page report a confident 0% growth rate, a 0 peak and an empty
 * trend chart beside a real total income. Abstaining is the honest state: the
 * trend keeps the partial month, and growth/peak come back `undefined` so the
 * cards render a dash.
 */
describe('useIncomeAnalysis -- only the month in progress', () => {
  beforeEach(() => {
    incomeResponseRef.current = JULY_ONLY_RESPONSE
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the partial month on the trend instead of charting nothing', async () => {
    const { result } = renderHook(() => useIncomeAnalysis(), { wrapper })
    await waitFor(() => expect(result.current.monthlyTrendData).toHaveLength(1))
    expect(result.current.monthlyTrendData[0].month).toBe('2026-07')
    expect(result.current.avgIncome).toBe(10000)
    expect(result.current.totalIncome).toBe(10000)
  })

  it('withholds the growth rate and peak rather than reporting 0', async () => {
    const { result } = renderHook(() => useIncomeAnalysis(), { wrapper })
    await waitFor(() => expect(result.current.totalIncome).toBe(10000))
    expect(result.current.growthRate).toBeUndefined()
    expect(result.current.peakIncome).toBeUndefined()
  })

  it('flags the partial-only basis so the notice explains the dashes', async () => {
    const { result } = renderHook(() => useIncomeAnalysis(), { wrapper })
    await waitFor(() => expect(result.current.noCompleteMonthBasis).toBe(true))
    expect(result.current.partialPeriod?.monthKey).toBe('2026-07')
  })

  it('reports zero rolling-average points, so the caption promises no line', async () => {
    const { result } = renderHook(() => useIncomeAnalysis(), { wrapper })
    await waitFor(() => expect(result.current.monthlyTrendData).toHaveLength(1))
    expect(result.current.rollingAvgPointCount).toBe(0)
  })
})

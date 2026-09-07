import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import QuickInsights from '../QuickInsights'

vi.mock('@/hooks/api/useAnalytics', () => {
  const query = (data: unknown) => ({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })

  return {
    useCategoryBreakdown: () => query({ categories: {} }),
    useQuickInsights: () => query({}),
    useTotals: () => query({
      total_income: 100_000,
      total_expenses: 40_000,
    }),
    useMonthlyAggregation: () => query({}),
  }
})

vi.mock('@/hooks/api/useAnalyticsV2', () => {
  const query = (data: unknown) => ({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })

  return {
    useDailySummaries: () => query([]),
    useMonthlySummaries: () => query([]),
  }
})

vi.mock('@/hooks/useAnimatedValue', () => ({
  useAnimatedValue: (value: string | number) => String(value),
}))

describe('QuickInsights groups', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps operating metrics out of Money flow when savings rate is hidden', () => {
    localStorage.setItem(
      'ledger-sync-visible-widgets',
      JSON.stringify(['top_spending']),
    )

    render(
      <QuickInsights
        dateRange={{ start_date: '2026-07-01', end_date: '2026-07-31' }}
        ageOfMoney={30}
      />,
    )

    const moneyFlow = screen
      .getByRole('heading', { name: 'Money flow' })
      .closest<HTMLElement>('section')
    const operating = screen
      .getByRole('heading', { name: 'Operating position' })
      .closest<HTMLElement>('section')

    expect(moneyFlow).not.toBeNull()
    expect(operating).not.toBeNull()
    expect(screen.queryByText('Savings Rate')).not.toBeInTheDocument()
    expect(within(moneyFlow!).queryByText('Age of Money')).not.toBeInTheDocument()
    expect(within(operating!).getByText('Age of Money')).toBeInTheDocument()
  })
})

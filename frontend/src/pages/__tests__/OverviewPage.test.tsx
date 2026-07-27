/**
 * Overview KPI delta label.
 *
 * The two headline cards carried a hardcoded `changeLabel="vs last month"`. The
 * percentage beside it is `useDashboardMetrics().momChanges`, which compares the
 * last two COMPLETE months -- so on any day except the 1st, "last month" is the
 * newer of the two, not the older one, and the figure the badge sits under is
 * the whole selected range rather than a month at all. The hook already returns
 * an accurate label (`"Jun vs May"`), which `QuickInsights` renders.
 *
 * These tests pin that the page READS that label rather than printing a second
 * hardcoded constant: the same page is rendered twice over different monthly
 * data and the label has to move with the months. A test asserting only one
 * string would pass just as happily against `changeLabel="Jun vs May"`.
 *
 * `MetricCard` falls back to the literal 'vs last month' whenever `changeLabel`
 * is undefined, so both fixtures deliberately produce a real percentage delta --
 * otherwise a missing label would look like a fixed one.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  monthlyAggregationOptions,
  recentTransactionsOptions,
  totalsOptions,
} from '@/hooks/api/useAnalytics'
import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import type { MonthlyAggregation, TotalsData } from '@/services/api/calculations'

import OverviewPage from '../OverviewPage'

/** One month bucket in the shape `/api/calculations/monthly-aggregation` returns. */
function month(income: number, expense: number) {
  return {
    income,
    expense,
    net_savings: income - expense,
    transactions: 2,
    income_count: 1,
    expense_count: 1,
  }
}

/** Complete months end at 2026-06, so the delta is Jun vs May. */
const THROUGH_JUNE: MonthlyAggregation = {
  '2026-05': month(100_000, 40_000),
  '2026-06': month(120_000, 50_000),
  '2026-07': month(0, 30_000),
}

/** Same ledger with June missing, so the delta slides back to May vs Apr. */
const THROUGH_MAY: MonthlyAggregation = {
  '2026-04': month(90_000, 30_000),
  '2026-05': month(100_000, 40_000),
  '2026-07': month(0, 30_000),
}

const TOTALS: TotalsData = {
  total_income: 220_000,
  total_expenses: 90_000,
  net_savings: 130_000,
  savings_rate: 59.1,
  transaction_count: 6,
}

/**
 * `all_time` is the default view mode, so the hook asks for an open date range.
 * Seeded through the shared key factories: `staleTime: Infinity` means a key
 * that misses by one segment leaves the page in its skeleton branch and the
 * assertions below would prove nothing.
 */
const ALL_TIME = { start_date: undefined, end_date: undefined }

function renderOverview(monthly: MonthlyAggregation) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(totalsOptions(ALL_TIME).queryKey, TOTALS)
  qc.setQueryData(monthlyAggregationOptions(ALL_TIME).queryKey, monthly)
  qc.setQueryData(recentTransactionsOptions(5).queryKey, [])
  qc.setQueryData(['transactions', undefined], [])
  qc.setQueryData(analyticsV2Keys.budgets({ active_only: true }), [])
  qc.setQueryData(analyticsV2Keys.goals(), [])
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OverviewPage KPI delta label', () => {
  beforeEach(() => {
    // Only Date is faked: MetricCard's count-up runs on requestAnimationFrame
    // and faking that too would leave the KPI mid-animation.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('names the two months the delta actually compares', () => {
    renderOverview(THROUGH_JUNE)

    // Income and Spending both carry a delta, so the label appears twice.
    expect(screen.getAllByText('Jun vs May')).toHaveLength(2)
    expect(screen.queryByText('vs last month')).not.toBeInTheDocument()
  })

  it('tracks the hook: different complete months, different label', () => {
    // The assertion that a second hardcoded string cannot satisfy. June is
    // absent here, so the same page must read May vs Apr off the same hook.
    const { unmount } = renderOverview(THROUGH_JUNE)
    expect(screen.getAllByText('Jun vs May')).toHaveLength(2)
    unmount()

    renderOverview(THROUGH_MAY)
    expect(screen.getAllByText('May vs Apr')).toHaveLength(2)
    expect(screen.queryByText('Jun vs May')).not.toBeInTheDocument()
  })

  it('renders a real delta beside the label, so the label is not a fallback', () => {
    // 120,000 vs 100,000 income is +20%; 50,000 vs 40,000 spending is +25%.
    // Without a defined `change`, MetricCard renders no label at all and the
    // test above would be asserting the absence of a card, not a fixed string.
    renderOverview(THROUGH_JUNE)

    expect(screen.getByText('+20%')).toBeInTheDocument()
    expect(screen.getByText('+25%')).toBeInTheDocument()
  })
})

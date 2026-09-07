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
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  monthlyAggregationOptions,
  recentTransactionsOptions,
  totalsOptions,
} from '@/hooks/api/useAnalytics'
import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import type { Budget, FinancialGoal } from '@/services/api/analyticsV2'
import type { MonthlyAggregation, TotalsData } from '@/services/api/calculations'
import type { Transaction } from '@/types'

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

const EMPTY_TOTALS: TotalsData = {
  total_income: 0,
  total_expenses: 0,
  net_savings: 0,
  savings_rate: 0,
  transaction_count: 0,
}

const LEDGER_TRANSACTION: Transaction = {
  id: 'txn-1',
  date: '2026-06-15',
  amount: 120_000,
  type: 'Income',
  category: 'Salary',
  account: 'Checking',
}

const AT_RISK_BUDGET: Budget = {
  id: 1,
  category: 'Food',
  subcategory: null,
  monthly_limit: 10_000,
  current_spent: 9_000,
  remaining: 1_000,
  usage_pct: 90,
  alert_threshold: 80,
  avg_actual: 8_500,
  months_over: 1,
  months_under: 5,
}

const ACTIVE_GOAL: FinancialGoal = {
  id: 1,
  name: 'Emergency fund',
  goal_type: 'savings',
  target_amount: 600_000,
  current_amount: 300_000,
  progress_pct: 50,
  start_date: '2026-01-01',
  target_date: '2026-12-31',
  is_achieved: false,
  achieved_date: null,
  notes: null,
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-06-15T00:00:00',
}

/**
 * `all_time` is the default view mode, so the hook asks for an open date range.
 * Seeded through the shared key factories: `staleTime: Infinity` means a key
 * that misses by one segment leaves the page in its skeleton branch and the
 * assertions below would prove nothing.
 */
const ALL_TIME = { start_date: undefined, end_date: undefined }

interface OverviewFixture {
  totals?: TotalsData
  transactions?: Transaction[]
  budgets?: Budget[]
  goals?: FinancialGoal[]
}

function renderOverview(
  monthly: MonthlyAggregation,
  {
    totals = TOTALS,
    transactions = [LEDGER_TRANSACTION],
    budgets = [],
    goals = [],
  }: OverviewFixture = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(totalsOptions(ALL_TIME).queryKey, totals)
  qc.setQueryData(monthlyAggregationOptions(ALL_TIME).queryKey, monthly)
  qc.setQueryData(recentTransactionsOptions(5).queryKey, [])
  qc.setQueryData(['transactions', undefined], transactions)
  qc.setQueryData(analyticsV2Keys.budgets({ active_only: true }), budgets)
  qc.setQueryData(analyticsV2Keys.goals(), goals)
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...view, queryClient: qc }
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

describe('OverviewPage empty states and period semantics', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the selector available so an empty period can recover to All Time', async () => {
    const julyToDate = { start_date: '2026-07-01', end_date: '2026-07-26' }
    const { queryClient } = renderOverview(THROUGH_JUNE)
    queryClient.setQueryData(totalsOptions(julyToDate).queryKey, EMPTY_TOTALS)
    queryClient.setQueryData(monthlyAggregationOptions(julyToDate).queryKey, {})

    fireEvent.click(screen.getByRole('tab', { name: 'Monthly' }))

    expect(await screen.findByRole('heading', { name: 'No transactions in this period' }))
      .toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Time range' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Upload Data' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'All Time' }))

    expect(await screen.findByRole('heading', { name: 'Category leaders' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No transactions in this period' }))
      .not.toBeInTheDocument()
  })

  it('reserves the upload prompt for a globally empty ledger', () => {
    renderOverview({}, { totals: EMPTY_TOTALS, transactions: [] })

    expect(screen.getByRole('heading', { name: 'No transactions yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upload Data' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Time range' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No transactions in this period' }))
      .not.toBeInTheDocument()
  })

  it('states that budgets and goals remain current when transaction periods change', () => {
    const yearToDate = { start_date: '2026-01-01', end_date: '2026-07-26' }
    const { queryClient } = renderOverview(THROUGH_JUNE, {
      budgets: [AT_RISK_BUDGET],
      goals: [ACTIVE_GOAL],
    })
    queryClient.setQueryData(totalsOptions(yearToDate).queryKey, TOTALS)
    queryClient.setQueryData(monthlyAggregationOptions(yearToDate).queryKey, THROUGH_JUNE)

    fireEvent.click(screen.getByRole('tab', { name: 'Yearly' }))

    expect(screen.getByRole('tab', { name: 'Yearly' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(
      'Categories at or above their alert threshold this month. The selected period applies only to transaction data.',
    )).toBeInTheDocument()
    expect(screen.getByText(
      'Active goals ordered by current completion. The selected period applies only to transaction data.',
    )).toBeInTheDocument()
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('Emergency fund')).toBeInTheDocument()
  })
})

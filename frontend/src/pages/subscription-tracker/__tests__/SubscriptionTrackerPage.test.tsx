import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatCurrency } from '@/lib/formatters'
import type { RecurringTransaction } from '@/services/api/analyticsV2'
import SubscriptionTrackerPage from '../SubscriptionTrackerPage'

const mocks = vi.hoisted(() => ({
  items: [] as RecurringTransaction[],
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  refetch: vi.fn(),
}))

vi.mock('@/hooks/api/useAnalyticsV2', () => ({
  useRecurringTransactions: () => ({
    data: mocks.items,
    isPending: false,
    isError: false,
    refetch: mocks.refetch,
  }),
  useCreateRecurringTransaction: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateRecurringTransaction: () => ({ mutate: mocks.update, isPending: false }),
  useDeleteRecurringTransaction: () => ({ mutate: mocks.remove, isPending: false }),
}))

vi.mock('@/hooks/useDemoGuard', () => ({
  useDemoGuard: () => ({ guardDemoAction: () => false }),
}))

function item(id: number, patch: Partial<RecurringTransaction> = {}): RecurringTransaction {
  return {
    id,
    name: `Synthetic commitment ${id}`,
    category: 'Utilities',
    subcategory: null,
    account: 'Synthetic account',
    type: 'Expense',
    frequency: 'monthly',
    expected_amount: 120,
    variance: 0,
    expected_day: 1,
    confidence: 80,
    occurrences: 4,
    last_occurrence: '2032-03-01',
    next_expected: null,
    times_missed: 0,
    is_active: true,
    is_confirmed: false,
    pattern_kind: 'commitment',
    ...patch,
  }
}

function renderPage() {
  return render(<MemoryRouter><SubscriptionTrackerPage /></MemoryRouter>)
}

describe('recurring freshness presentation', () => {
  beforeEach(() => {
    mocks.items = []
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2032, 3, 1, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('prioritizes confirmed and recent commitments while retaining old detections and their amounts', () => {
    mocks.items = [
      item(1, { name: 'Old detection', expected_amount: 900, last_occurrence: '2031-01-01' }),
      item(2, { name: 'Confirmed commitment', is_confirmed: true, expected_amount: 120, last_occurrence: '2028-01-01' }),
      item(3, { name: 'Recent detection', expected_amount: 240 }),
      item(4, { name: 'Undated detection', expected_amount: 500, last_occurrence: null }),
    ]
    renderPage()

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Confirmed commitment', 'Recent detection', 'Undated detection', 'Old detection',
    ])
    const table = screen.getByRole('table', { name: 'Monthly commitment estimates by freshness' })
    expect(within(table).getByRole('row', { name: /Confirmed or recent/ })).toHaveTextContent(formatCurrency(360))
    expect(within(table).getByRole('row', { name: /Needs review/ })).toHaveTextContent(formatCurrency(900))
    expect(within(table).getByRole('row', { name: /Date or frequency unavailable/ })).toHaveTextContent(formatCurrency(500))
    expect(screen.getByText(/These still count in your totals/)).toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('keeps the summary and recurring mix visible when every active item needs review', () => {
    mocks.items = [item(1, { last_occurrence: '2031-01-01' })]
    renderPage()

    expect(screen.getByRole('heading', { name: 'Needs review (1)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recurring mix' })).toBeInTheDocument()
    expect(screen.getByText('Monthly Expense')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No recurring transactions yet' })).not.toBeInTheDocument()
    expect(screen.getByText('No recent matching entry. Review whether this still recurs.')).toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('lets the user confirm a flagged commitment without implicitly pausing it', () => {
    mocks.items = [item(1, { last_occurrence: '2031-01-01' })]
    const { rerender } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm recurring item' }))

    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(
      { id: 1, is_confirmed: true },
      expect.anything(),
    )
    mocks.items = [item(1, { last_occurrence: '2031-01-01', is_confirmed: true })]
    rerender(<MemoryRouter><SubscriptionTrackerPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Confirmed (1)' })).toBeInTheDocument()
    expect(screen.queryByText('Needs review')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause recurring item' })).toBeInTheDocument()
  })

  it('keeps paused items separate and does not describe them as cancelled or savings', () => {
    mocks.items = [item(1, { is_active: false, last_occurrence: '2031-01-01' })]
    renderPage()

    expect(screen.getByText('Paused expenses (1)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Paused (1)' })).toBeInTheDocument()
    expect(screen.queryByText('Needs review')).not.toBeInTheDocument()
    expect(screen.queryByText(/cancelled|saved monthly/i)).not.toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

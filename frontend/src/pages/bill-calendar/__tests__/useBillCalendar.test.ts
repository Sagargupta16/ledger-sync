import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RecurringTransaction } from '@/services/api/analyticsV2'
import { useBillCalendar } from '../useBillCalendar'

const mocks = vi.hoisted(() => ({
  useRecurringTransactions: vi.fn(),
}))
vi.mock('@/hooks/api/useAnalyticsV2', () => ({
  useRecurringTransactions: mocks.useRecurringTransactions,
}))

function bill(patch: Partial<RecurringTransaction> = {}): RecurringTransaction {
  return {
    id: 1, name: 'Rent', type: 'Expense', category: 'Housing', subcategory: null,
    account: 'Manual', frequency: 'monthly', expected_amount: 100, variance: 0,
    expected_day: 1, confidence: 100, occurrences: 0, last_occurrence: null,
    next_expected: null, times_missed: 0, is_active: true, is_confirmed: true,
    pattern_kind: 'commitment', ...patch,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 2))
})
afterEach(() => vi.useRealTimers())

describe('useBillCalendar', () => {
  it('keeps manual bills visible when their due date cannot be scheduled', () => {
    mocks.useRecurringTransactions.mockReturnValue({
      data: [
        bill(),
        bill({ id: 2, name: 'Weekly helper', frequency: 'weekly', expected_day: null }),
        bill({ id: 3, name: 'Lunch', pattern_kind: 'habit' }),
        bill({ id: 4, name: 'Old rent', is_confirmed: false, last_occurrence: '2024-01-01' }),
      ],
      isLoading: false, isError: false,
    })
    const { result } = renderHook(() => useBillCalendar())
    expect(result.current.summary.totalDue).toBe(100)
    expect(result.current.unscheduledBills.map((item) => item.name)).toEqual(['Weekly helper'])
    expect(result.current.hasAnyData).toBe(true)
    expect(mocks.useRecurringTransactions).toHaveBeenCalledWith({
      active_only: true, min_confidence: 0, pattern_kind: 'commitment',
    })
  })
})

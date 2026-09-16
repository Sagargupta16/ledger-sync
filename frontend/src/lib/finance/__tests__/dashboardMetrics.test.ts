import { describe, expect, it } from 'vitest'
import type { MonthlyAggregation } from '@/services/api/calculations'
import { computeMonthlyChanges } from '../dashboardMetrics'

const period = (income: number, expense: number, net: number): MonthlyAggregation[string] => ({
  income,
  expense,
  net_savings: net,
  transactions: 2,
  income_count: 1,
  expense_count: 1,
})

describe('complete-month dashboard comparisons', () => {
  it('compares adjacent calendar months when an unemployed month has no rows', () => {
    const changes = computeMonthlyChanges({
      '2026-01': period(100000, -40000, 60000),
      '2026-03': period(100000, -40000, 60000),
    }, new Date(2026, 3, 10))
    expect(changes.label).toBe('Mar 26 vs Feb 26')
    expect(changes.income).toBeUndefined()
  })

  it('does not call the jump from college allowance to first earnings income growth', () => {
    const changes = computeMonthlyChanges({
      '2026-04': period(1000, -500, 500),
      '2026-05': period(100000, -40000, 60000),
    }, new Date(2026, 5, 10), '2026-05-01')
    expect(changes.income).toBeUndefined()
    expect(changes.expense).toBe(7900)
  })

  it('includes capital losses in the savings rate and ignores partial/future months', () => {
    const changes = computeMonthlyChanges({
      '2026-04': period(100_000, -40_000, 60_000),
      '2026-05': period(100_000, -40_000, 40_000),
      '2026-06': period(0, -40_000, -40_000),
      '2026-07': period(200_000, 0, 200_000),
    }, new Date(2026, 5, 10))

    expect(changes.income).toBe(0)
    expect(changes.expense).toBe(0)
    expect(changes.savings).toBe(-33.3)
    expect(changes.savingsRate).toBe(-20)
    expect(changes.label).toBe('May 26 vs Apr 26')
  })

  it('reports improvement when net cash flow crosses zero', () => {
    const changes = computeMonthlyChanges({
      '2026-04': period(0, 1000, -1000),
      '2026-05': period(1000, 500, 500),
    }, new Date(2026, 5, 10))

    expect(changes.savings).toBe(150)
    expect(changes.income).toBeUndefined()
    expect(changes.savingsRate).toBeUndefined()
  })
})

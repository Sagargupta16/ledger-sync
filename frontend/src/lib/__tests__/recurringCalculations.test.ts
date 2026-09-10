import { describe, expect, it } from 'vitest'

import {
  getRecurringFreshness,
  summarizeRecurringCommitments,
  type RecurringCalculationInput,
} from '@/lib/recurringCalculations'

const AS_OF = '2032-04-01'

function item(patch: Partial<RecurringCalculationInput> = {}): RecurringCalculationInput {
  return {
    type: 'Expense',
    frequency: 'monthly',
    expected_amount: 120,
    last_occurrence: '2032-03-01',
    is_active: true,
    is_confirmed: false,
    pattern_kind: 'commitment',
    ...patch,
  }
}

function daysBefore(days: number): string {
  const date = new Date(`${AS_OF}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

describe('getRecurringFreshness', () => {
  it.each([
    ['daily', 9],
    ['weekly', 21],
    ['biweekly', 35],
    ['monthly', 69],
    ['bimonthly', 131],
    ['quarterly', 193],
    ['semiannual', 379],
    ['yearly', 739],
  ])('only flags %s detections after the conservative %i-day window', (frequency, window) => {
    expect(getRecurringFreshness(item({ frequency, last_occurrence: daysBefore(window) }), AS_OF))
      .toBe('recent')
    expect(getRecurringFreshness(item({ frequency, last_occurrence: daysBefore(window + 1) }), AS_OF))
      .toBe('needs-review')
  })

  it('uses the shared case normalization and frequency aliases', () => {
    const old = daysBefore(36)
    expect(getRecurringFreshness(item({ frequency: '  FORTNIGHTLY ', last_occurrence: old }), AS_OF))
      .toBe('needs-review')
    expect(getRecurringFreshness(item({ frequency: 'ANNUALLY', last_occurrence: daysBefore(739) }), AS_OF))
      .toBe('recent')
  })

  it('keeps confirmed records trusted regardless of age or missing metadata', () => {
    expect(getRecurringFreshness(item({ is_confirmed: true, last_occurrence: '2028-01-01' }), AS_OF))
      .toBe('confirmed')
    expect(getRecurringFreshness(item({ is_confirmed: true, last_occurrence: null, frequency: null }), AS_OF))
      .toBe('confirmed')
  })

  it('does not flag an already-paused record', () => {
    expect(getRecurringFreshness(item({ is_active: false, last_occurrence: '2028-01-01' }), AS_OF))
      .toBe('paused')
  })

  it.each([
    { last_occurrence: null },
    { last_occurrence: 'not-a-date' },
    { last_occurrence: '2032-02-30' },
    { last_occurrence: '2032-04-02' },
    { frequency: null },
    { frequency: 'unknown' },
  ])('does not call incomplete or future data recent: %j', (patch) => {
    expect(getRecurringFreshness(item(patch), AS_OF)).toBe('unassessed')
  })

  it('compares calendar days, ignoring time-of-day and daylight-saving shifts', () => {
    const boundary = `${daysBefore(69)}T23:59:59.000Z`
    expect(getRecurringFreshness(item({ last_occurrence: boundary }), `${AS_OF}T00:00:00`))
      .toBe('recent')
    expect(getRecurringFreshness(item({ last_occurrence: `${daysBefore(70)}T23:59:59` }), AS_OF))
      .toBe('needs-review')
  })
})

describe('summarizeRecurringCommitments', () => {
  it('preserves every active amount while separating review status and paused expenses', () => {
    const records = [
      item({ is_confirmed: true, last_occurrence: '2028-01-01' }),
      item({ frequency: 'yearly', expected_amount: 1200 }),
      item({ type: 'Income', is_confirmed: true, expected_amount: 1200 }),
      item({ frequency: 'weekly', expected_amount: -12, last_occurrence: '2031-01-01' }),
      item({ type: 'Income', frequency: 'yearly', expected_amount: 1200, last_occurrence: '2028-01-01' }),
      item({ frequency: null, expected_amount: 30, last_occurrence: null }),
      item({ pattern_kind: 'habit', expected_amount: 1000 }),
      item({ is_active: false, expected_amount: 20 }),
      item({ type: 'Income', is_active: false, expected_amount: 30 }),
    ]
    const unchanged = structuredClone(records)
    records.forEach(Object.freeze)
    Object.freeze(records)

    const summary = summarizeRecurringCommitments(records, AS_OF)

    expect(summary).toEqual({
      monthlyExpense: 302,
      monthlyIncome: 1300,
      netMonthly: 998,
      count: 6,
      current: { monthlyExpense: 220, monthlyIncome: 1200, count: 3 },
      needsReview: { monthlyExpense: 52, monthlyIncome: 100, count: 2 },
      unassessed: { monthlyExpense: 30, monthlyIncome: 0, count: 1 },
      pausedMonthlyExpense: 20,
      pausedExpenseCount: 1,
    })
    expect(records).toEqual(unchanged)
  })

  it('retains the existing daily annualization for a detection needing review', () => {
    const summary = summarizeRecurringCommitments([
      item({ frequency: 'daily', expected_amount: 12, last_occurrence: '2031-01-01' }),
    ], AS_OF)
    expect(summary.monthlyExpense).toBe(365)
    expect(summary.needsReview.monthlyExpense).toBe(365)
    expect(summary.current.monthlyExpense).toBe(0)
  })

  it('keeps headline totals stable when only freshness changes', () => {
    const records = [item({ last_occurrence: '2032-01-23' })]
    const recent = summarizeRecurringCommitments(records, '2032-02-01')
    const old = summarizeRecurringCommitments(records, '2032-06-01')
    expect(recent.monthlyExpense).toBe(old.monthlyExpense)
    expect(recent.netMonthly).toBe(old.netMonthly)
    expect(recent.current.count).toBe(1)
    expect(old.needsReview.count).toBe(1)
  })
})

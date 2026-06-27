import { describe, expect, it } from 'vitest'

import { computePeakDay, computeWeekendSplit } from '../quickInsightsData'
import type { Transaction } from '@/types'

/**
 * Regression coverage for the timezone bug: `new Date('YYYY-MM-DD').getDay()`
 * parses as UTC midnight but reads the LOCAL weekday, so a Saturday txn read
 * as Friday for negative-offset users. The fix parses Y/M/D into a local date.
 * These dates are weekend days in 2026: 2026-06-06 (Sat), 2026-06-07 (Sun),
 * 2026-06-08 (Mon, weekday). The assertions must hold regardless of the
 * machine timezone (CI runs UTC; this guards the US-offset case too).
 */
function tx(date: string, amount: number): Transaction {
  return {
    id: `${date}-${amount}`,
    date,
    amount,
    type: 'Expense',
    category: 'Test',
    account: 'Test',
  } as Transaction
}

describe('computeWeekendSplit', () => {
  it('buckets Sat/Sun as weekend and Mon as weekday by calendar date', () => {
    const result = computeWeekendSplit([
      tx('2026-06-06', 100), // Saturday
      tx('2026-06-07', 50), // Sunday
      tx('2026-06-08', 30), // Monday
    ])
    expect(result.weekend).toBe(150)
    expect(result.weekday).toBe(30)
  })

  it('handles datetime strings (takes the date part)', () => {
    const result = computeWeekendSplit([tx('2026-06-06T23:30:00', 100)]) // Saturday
    expect(result.weekend).toBe(100)
    expect(result.weekday).toBe(0)
  })
})

describe('computePeakDay', () => {
  it('identifies the highest-spend weekday by calendar date', () => {
    const result = computePeakDay([
      tx('2026-06-06', 500), // Saturday
      tx('2026-06-08', 100), // Monday
    ])
    expect(result.name).toBe('Saturday')
    expect(result.total).toBe(500)
  })
})

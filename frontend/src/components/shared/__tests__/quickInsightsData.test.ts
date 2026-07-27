import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  computeNetCashback,
  computePeakDay,
  computeWeekendSplit,
  getVisibleWidgetKeys,
} from '../quickInsightsData'
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

describe('computeNetCashback', () => {
  const cb = (subcategory: string, amount: number, type = 'Income'): Transaction =>
    ({ id: `${subcategory}-${amount}`, date: '2026-06-06', amount, type, category: 'X', subcategory, account: 'A' }) as Transaction

  it('matches cashback by subcategory substring, regardless of the parent category spelling', () => {
    // Regression: real data uses "Refunds & Cashbacks" (plural); the old exact
    // "Refund & Cashbacks" match returned 0. Match on the "cashback" subcategory.
    const txns = [
      cb('Credit Card Cashbacks', 300),
      cb('Other Cashbacks', 200),
      cb('Product/Service Refunds', 999), // a refund, NOT cashback -> excluded
    ]
    const { netCashback, cashbackCount } = computeNetCashback(txns)
    expect(netCashback).toBe(500)
    expect(cashbackCount).toBe(2)
  })

  it('subtracts shared cashback matched by destination substring', () => {
    const txns: Transaction[] = [
      cb('Credit Card Cashbacks', 1000),
      { id: 's1', date: '2026-06-06', amount: 250, type: 'Transfer', category: 'X', account: 'A', to_account: 'Transfer: CC -> Cashback Shared' } as Transaction,
    ]
    expect(computeNetCashback(txns).netCashback).toBe(750)
  })
})

/**
 * The widget-visibility reader shares the 'ledger-sync-visible-widgets' key
 * with settings/helpers.ts getStoredWidgets, but the two have DIFFERENT
 * empty-storage defaults on purpose: this one returns null ("no filter, show
 * all"), while getStoredWidgets returns the 6-key DEFAULT_VISIBLE_WIDGETS set.
 * They must not be consolidated. These cases pin the corruption handling that
 * the unknown-narrowing had to leave untouched.
 */
describe('getVisibleWidgetKeys', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when nothing is stored, meaning show all', () => {
    expect(getVisibleWidgetKeys()).toBeNull()
  })

  it('returns the stored subset as a Set', () => {
    localStorage.setItem('ledger-sync-visible-widgets', JSON.stringify(['savings_rate', 'peak_day']))
    expect(getVisibleWidgetKeys()).toEqual(new Set(['savings_rate', 'peak_day']))
  })

  it('treats 14 or more stored widgets as no filter', () => {
    const all = Array.from({ length: 14 }, (_, i) => `widget_${i}`)
    localStorage.setItem('ledger-sync-visible-widgets', JSON.stringify(all))
    expect(getVisibleWidgetKeys()).toBeNull()
  })

  it.each([
    ['an object', '{"savings_rate":true}'],
    ['a number', '123'],
    ['a boolean', 'true'],
    ['null', 'null'],
    ['invalid json', 'nope'],
  ])('warns and falls back to show-all for %s', (_label, stored) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem('ledger-sync-visible-widgets', stored)

    expect(getVisibleWidgetKeys()).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('consumes a stored string character-wise rather than swallowing it', () => {
    // A string is iterable, so this has always yielded characters. Pinned
    // because an Array.isArray guard would silently turn it into show-all.
    localStorage.setItem('ledger-sync-visible-widgets', '"abc"')
    expect(getVisibleWidgetKeys()).toEqual(new Set(['a', 'b', 'c']))
  })
})

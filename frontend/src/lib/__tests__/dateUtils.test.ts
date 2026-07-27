import { afterEach, describe, it, expect, vi } from 'vitest'

import {
  addDaysToKey,
  addMonthsToKey,
  addMonthsToMonthKey,
  monthKeysBetween,
  getCurrentMonth,
  getTodayKey,
  capEndDateAtToday,
  capSeriesToToday,
  daysInMonth,
  dropPartialMonth,
  endOfPreviousMonth,
  filterTransactionsByDateRange,
  formatMonthKey,
  getMonthProgress,
  inclusiveDaySpan,
  isPartialMonth,
  projectPartialMonth,
  resolvePartialPeriod,
  toCompleteMonthsRange,
  toLocalDateKey,
} from '../dateUtils'

/**
 * These guard the timezone-stable date helpers. The bug class they replace:
 * `new Date('2024-01-01')` parses as UTC midnight, so local getters / local
 * formatting shift the calendar day (and month) for negative-offset users.
 * The helpers build Dates from explicit local components instead.
 */
describe('toLocalDateKey', () => {
  it('formats a local-midnight date as its own calendar day', () => {
    // Built from local components -> key must echo those components exactly.
    expect(toLocalDateKey(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(toLocalDateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('zero-pads month and day', () => {
    expect(toLocalDateKey(new Date(2026, 2, 5))).toBe('2026-03-05')
  })

  it('round-trips the same calendar day it was constructed from', () => {
    const d = new Date(2026, 5, 6) // 6 Jun 2026, local midnight
    const key = toLocalDateKey(d)
    const [y, m, day] = key.split('-').map(Number)
    expect(y).toBe(d.getFullYear())
    expect(m).toBe(d.getMonth() + 1)
    expect(day).toBe(d.getDate())
  })
})

describe('formatMonthKey', () => {
  it('formats a YYYY-MM key without a UTC round-trip shift', () => {
    // January must read as January (not December of the prior year, which is
    // what new Date('2026-01-01').toLocaleDateString gives in US zones).
    expect(formatMonthKey('2026-01')).toBe('Jan 2026')
    expect(formatMonthKey('2026-12')).toBe('Dec 2026')
  })

  it('accepts a full YYYY-MM-DD and uses only the month', () => {
    expect(formatMonthKey('2026-07-15')).toBe('Jul 2026')
  })

  it('honors custom Intl options', () => {
    expect(formatMonthKey('2026-03', { month: 'short', year: '2-digit' })).toBe("Mar 26")
  })

  it('returns the input unchanged for an unparseable key', () => {
    expect(formatMonthKey('not-a-date')).toBe('not-a-date')
  })
})

describe('capEndDateAtToday', () => {
  const today = toLocalDateKey(new Date())
  const yesterday = toLocalDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000))
  const tomorrow = toLocalDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000))

  it('caps a future end_date at today', () => {
    const result = capEndDateAtToday({ start_date: '2026-01-01', end_date: tomorrow })
    expect(result.end_date).toBe(today)
    expect(result.start_date).toBe('2026-01-01')
  })

  it('leaves past end_date untouched', () => {
    const range = { start_date: '2020-01-01', end_date: yesterday }
    expect(capEndDateAtToday(range)).toBe(range)
  })

  it('preserves null end_date (all_time)', () => {
    const range = { start_date: null, end_date: null }
    expect(capEndDateAtToday(range)).toBe(range)
  })

  it('does not mutate the input when capping', () => {
    const range = { start_date: '2026-01-01', end_date: '2999-12-31' }
    capEndDateAtToday(range)
    expect(range.end_date).toBe('2999-12-31')
  })
})

describe('filterTransactionsByDateRange', () => {
  const rows = [
    { date: '2026-05-31', v: 1 },
    { date: '2026-06-30', v: 2 },
    { date: '2026-07-10', v: 3 },
  ]

  it('applies an end bound even with no start bound', () => {
    // The all-time view narrowed to complete months is exactly this shape.
    // Short-circuiting on the missing start returned the whole ledger and
    // silently reinstated the in-progress month the caller had excluded.
    expect(filterTransactionsByDateRange(rows, { end_date: '2026-06-30' })).toEqual(
      rows.slice(0, 2),
    )
  })

  it('applies a start bound with no end bound', () => {
    expect(filterTransactionsByDateRange(rows, { start_date: '2026-06-01' })).toEqual(rows.slice(1))
  })

  it('applies both bounds inclusively', () => {
    expect(
      filterTransactionsByDateRange(rows, { start_date: '2026-06-30', end_date: '2026-06-30' }),
    ).toEqual([rows[1]])
  })

  it('returns the same array when both bounds are absent', () => {
    expect(filterTransactionsByDateRange(rows, {})).toBe(rows)
  })
})

describe('capSeriesToToday', () => {
  const today = toLocalDateKey(new Date())
  const currentMonth = today.slice(0, 7)

  it('drops future day-keyed rows and keeps today', () => {
    const rows = [
      { date: '2020-01-01', v: 1 },
      { date: today, v: 2 },
      { date: '2999-12-31', v: 3 }
    ]
    expect(capSeriesToToday(rows, 'date')).toEqual([
      { date: '2020-01-01', v: 1 },
      { date: today, v: 2 }
    ])
  })

  it('drops future month-keyed rows and keeps current month', () => {
    const rows = [
      { month: '2020-06', v: 1 },
      { month: currentMonth, v: 2 },
      { month: '2999-12', v: 3 }
    ]
    expect(capSeriesToToday(rows, 'month')).toEqual([
      { month: '2020-06', v: 1 },
      { month: currentMonth, v: 2 }
    ])
  })

  it('handles Date-valued keys', () => {
    const rows = [
      { d: new Date(2020, 0, 1), v: 1 },
      { d: new Date(2999, 11, 31), v: 2 }
    ]
    expect(capSeriesToToday(rows, 'd')).toEqual([rows[0]])
  })

  it('returns empty array unchanged', () => {
    expect(capSeriesToToday([] as Array<{ date: string }>, 'date')).toEqual([])
  })

  it('preserves original order (does not sort)', () => {
    const rows = [
      { date: '2022-05-01', v: 1 },
      { date: '2020-01-01', v: 2 },
      { date: today, v: 3 }
    ]
    expect(capSeriesToToday(rows, 'date').map((r) => r.v)).toEqual([1, 2, 3])
  })
})

/**
 * Partial-period helpers. The bug class they replace: a month still in
 * progress is charted and compared as if it were complete. On a real ledger
 * where salary lands near month-end, the 26th of the month showed income of
 * 13,511 against a typical 225,000, so the naive savings rate read -696.8%.
 */
describe('addDaysToKey', () => {
  it('shifts within a month', () => {
    expect(addDaysToKey('2026-07-01', 25)).toBe('2026-07-26')
  })

  it('rolls over month and year boundaries', () => {
    expect(addDaysToKey('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles leap February', () => {
    expect(addDaysToKey('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDaysToKey('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('shifts backwards for a negative offset', () => {
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('accepts a longer ISO string and returns a date key', () => {
    expect(addDaysToKey('2026-07-26T10:30:00', 0)).toBe('2026-07-26')
  })
})

describe('getCurrentMonth / getTodayKey in a positive-offset zone', () => {
  afterEach(() => {
    // `vi.stubEnv`, not a hand-rolled `process.env` save/restore: app tsconfig
    // deliberately omits node types, and assigning `undefined` back would store
    // the literal string "undefined" (which resolves to UTC) and leak into every
    // later local-time test in this file. `unstubAllEnvs` restores the real value.
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('reports the LOCAL month during the IST hours where UTC is still yesterday', () => {
    vi.stubEnv('TZ', 'Asia/Kolkata')
    // 00:30 IST on 1 August; the UTC instant is still 31 July.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-31T19:00:00.000Z'))

    // Guard the guard: if the TZ override did not take, this fails loudly
    // instead of letting the real assertions pass for the wrong reason.
    expect(new Date().getMonth()).toBe(7) // August, locally
    expect(new Date().toISOString().slice(0, 7)).toBe('2026-07')

    // The defect: `toISOString().substring(0,7)` seeded the monthly time filter
    // on Dashboard, every analytics page and Year-in-Review, so a session opened
    // in this window silently loaded the PREVIOUS month.
    expect(getCurrentMonth()).toBe('2026-08')
    expect(getTodayKey()).toBe('2026-08-01')
  })

  it('reports the local fiscal-year-start month at the April boundary', () => {
    vi.stubEnv('TZ', 'Asia/Kolkata')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-31T20:00:00.000Z')) // 01:30 IST, 1 April

    expect(new Date().getMonth()).toBe(3)
    // Worst case: the previous month is also the previous fiscal year.
    expect(getCurrentMonth()).toBe('2026-04')
  })
})

describe('addMonthsToKey', () => {
  it('shifts a mid-month day plainly', () => {
    expect(addMonthsToKey('2026-07-15', 1)).toBe('2026-08-15')
    expect(addMonthsToKey('2026-07-15', 12)).toBe('2027-07-15')
  })

  it('clamps a month-end day instead of overflowing into the next month', () => {
    // `new Date('2026-01-31').setMonth(+1)` yields 2026-03-03. That overflow is
    // what made 60-point projections render only 35 distinct month labels.
    expect(addMonthsToKey('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsToKey('2024-01-31', 1)).toBe('2024-02-29') // leap year
    expect(addMonthsToKey('2026-05-31', 1)).toBe('2026-06-30')
  })

  it('does not accumulate the clamp: each step is measured from the anchor', () => {
    expect(addMonthsToKey('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonthsToKey('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('crosses year boundaries in both directions', () => {
    expect(addMonthsToKey('2026-12-31', 1)).toBe('2027-01-31')
    expect(addMonthsToKey('2026-01-15', -1)).toBe('2025-12-15')
    expect(addMonthsToKey('2026-03-31', -1)).toBe('2026-02-28')
  })

  it('yields one distinct month per step over a 60-month horizon', () => {
    const months = new Set(
      Array.from({ length: 60 }, (_, i) => addMonthsToKey('2025-12-31', i + 1).slice(0, 7)),
    )
    expect(months.size).toBe(60)
  })

  it('accepts a longer ISO string and returns a date key', () => {
    expect(addMonthsToKey('2026-07-26T10:30:00', 0)).toBe('2026-07-26')
  })
})

describe('addMonthsToMonthKey', () => {
  it('steps a month key forward and back', () => {
    expect(addMonthsToMonthKey('2026-07', 1)).toBe('2026-08')
    expect(addMonthsToMonthKey('2026-07', -1)).toBe('2026-06')
    expect(addMonthsToMonthKey('2026-07', 0)).toBe('2026-07')
  })

  it('wraps at the year boundary in both directions', () => {
    // The wrap that was hand-rolled at two call sites before this existed.
    expect(addMonthsToMonthKey('2026-12', 1)).toBe('2027-01')
    expect(addMonthsToMonthKey('2026-01', -1)).toBe('2025-12')
    expect(addMonthsToMonthKey('2026-06', 18)).toBe('2027-12')
    expect(addMonthsToMonthKey('2026-06', -18)).toBe('2024-12')
  })

  it('accepts a full date key and answers in month resolution', () => {
    // Callers hold `YYYY-MM-DD` as often as `YYYY-MM`; a month-end day must not
    // clamp its way into a different month.
    expect(addMonthsToMonthKey('2026-01-31', 1)).toBe('2026-02')
    expect(addMonthsToMonthKey('2026-08-31', 1)).toBe('2026-09')
  })
})

describe('monthKeysBetween', () => {
  it('is inclusive of both ends', () => {
    expect(monthKeysBetween('2026-04', '2026-07')).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ])
    expect(monthKeysBetween('2026-04', '2026-04')).toEqual(['2026-04'])
  })

  it('crosses a year boundary without a gap or a repeat', () => {
    expect(monthKeysBetween('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })

  it('is empty when the end precedes the start', () => {
    // `spanMonthKeys` relies on this to fall back to its caller's own months
    // instead of reporting a zero for an inverted or all-future window.
    expect(monthKeysBetween('2026-07', '2026-04')).toEqual([])
  })

  it('accepts full date keys and yields month resolution', () => {
    expect(monthKeysBetween('2026-05-17', '2026-07-02')).toEqual(['2026-05', '2026-06', '2026-07'])
  })

  it('yields one key per calendar month over a long span', () => {
    // 100 months is past any single FY window and well inside the runaway guard.
    const keys = monthKeysBetween('2018-03', '2026-06')
    expect(keys).toHaveLength(100)
    expect(new Set(keys).size).toBe(100)
    expect(keys[0]).toBe('2018-03')
    expect(keys.at(-1)).toBe('2026-06')
  })
})

describe('inclusiveDaySpan', () => {
  it('counts a single day as 1', () => {
    expect(inclusiveDaySpan('2026-07-26', '2026-07-26')).toBe(1)
  })

  it('counts a full month inclusively', () => {
    expect(inclusiveDaySpan('2026-01-01', '2026-01-31')).toBe(31)
  })

  it('counts a non-leap year as 365 and a leap year as 366', () => {
    expect(inclusiveDaySpan('2026-01-01', '2026-12-31')).toBe(365)
    expect(inclusiveDaySpan('2024-01-01', '2024-12-31')).toBe(366)
  })

  it('counts a fiscal year across the year boundary', () => {
    expect(inclusiveDaySpan('2025-04-01', '2026-03-31')).toBe(365)
  })

  it('floors at 1 for an inverted range', () => {
    expect(inclusiveDaySpan('2026-07-26', '2026-07-01')).toBe(1)
  })
})

describe('daysInMonth', () => {
  it('returns calendar length for 31, 30, and 28 day months', () => {
    expect(daysInMonth('2026-01')).toBe(31)
    expect(daysInMonth('2026-04')).toBe(30)
    expect(daysInMonth('2026-02')).toBe(28)
  })

  it('handles leap February', () => {
    expect(daysInMonth('2024-02')).toBe(29)
  })

  it('accepts a full date key', () => {
    expect(daysInMonth('2026-07-26')).toBe(31)
  })
})

describe('getMonthProgress', () => {
  const now = new Date(2026, 6, 26) // 2026-07-26, 31-day month

  it('reports the current month as partial with elapsed days', () => {
    expect(getMonthProgress('2026-07', now)).toEqual({
      isPartial: true,
      daysElapsed: 26,
      daysTotal: 31,
      fraction: 26 / 31,
    })
  })

  it('reports a past month as complete', () => {
    expect(getMonthProgress('2026-06', now)).toEqual({
      isPartial: false,
      daysElapsed: 30,
      daysTotal: 30,
      fraction: 1,
    })
  })

  it('reports a future month as not partial with zero elapsed', () => {
    expect(getMonthProgress('2026-08', now)).toEqual({
      isPartial: false,
      daysElapsed: 0,
      daysTotal: 31,
      fraction: 0,
    })
  })

  it('treats the last day of the month as fully elapsed', () => {
    expect(getMonthProgress('2026-07', new Date(2026, 6, 31)).fraction).toBe(1)
  })

  it('is not partial on the last day -- every calendar day already exists', () => {
    // Otherwise the 31st deletes a whole real month from every month-on-month
    // trend, and PartialPeriodNotice (hidden at 31 of 31) explains nothing.
    expect(getMonthProgress('2026-07', new Date(2026, 6, 31)).isPartial).toBe(false)
    expect(getMonthProgress('2026-07', new Date(2026, 6, 30)).isPartial).toBe(true)
  })
})

describe('isPartialMonth', () => {
  const now = new Date(2026, 6, 26)

  it('is true only for the current month', () => {
    expect(isPartialMonth('2026-07', now)).toBe(true)
    expect(isPartialMonth('2026-06', now)).toBe(false)
    expect(isPartialMonth('2026-08', now)).toBe(false)
  })

  it('is false once the current month reaches its last day', () => {
    expect(isPartialMonth('2026-07', new Date(2026, 6, 31))).toBe(false)
  })
})

describe('dropPartialMonth', () => {
  const now = new Date(2026, 6, 26)

  it('drops the in-progress month from a month-keyed series', () => {
    const rows = [
      { month: '2026-05', savingsRate: 46 },
      { month: '2026-06', savingsRate: 52 },
      { month: '2026-07', savingsRate: -696.8 },
    ]
    expect(dropPartialMonth(rows, 'month', now)).toEqual(rows.slice(0, 2))
  })

  it('drops day-keyed rows that fall in the partial month', () => {
    const rows = [{ date: '2026-06-30', v: 1 }, { date: '2026-07-02', v: 2 }]
    expect(dropPartialMonth(rows, 'date', now)).toEqual([rows[0]])
  })

  it('keeps rows whose key is not a date', () => {
    const rows = [{ month: null as unknown as string, v: 1 }]
    expect(dropPartialMonth(rows, 'month', now)).toEqual(rows)
  })

  it('returns an empty series unchanged', () => {
    expect(dropPartialMonth([] as Array<{ month: string }>, 'month', now)).toEqual([])
  })
})

describe('projectPartialMonth', () => {
  const now = new Date(2026, 6, 26)

  it('extrapolates a partial total to a full-month estimate', () => {
    expect(projectPartialMonth(26000, '2026-07', now)).toBeCloseTo(31000, 6)
  })

  it('leaves a complete month untouched', () => {
    expect(projectPartialMonth(30000, '2026-06', now)).toBe(30000)
  })

  it('returns the input when no days have elapsed', () => {
    expect(projectPartialMonth(0, '2026-08', now)).toBe(0)
  })
})

/**
 * `now` is injected everywhere below -- these helpers exist to reason about
 * "today", so a test that read the real clock would pass on the 26th and fail
 * on the 31st.
 */
describe('endOfPreviousMonth', () => {
  it('returns the last day of the month before now', () => {
    expect(endOfPreviousMonth(new Date(2026, 6, 26))).toBe('2026-06-30')
    expect(endOfPreviousMonth(new Date(2026, 2, 5))).toBe('2026-02-28')
  })

  it('crosses the year boundary', () => {
    expect(endOfPreviousMonth(new Date(2026, 0, 15))).toBe('2025-12-31')
  })

  it('is unaffected by the day within the month', () => {
    expect(endOfPreviousMonth(new Date(2026, 6, 1))).toBe('2026-06-30')
    expect(endOfPreviousMonth(new Date(2026, 6, 31))).toBe('2026-06-30')
  })
})

describe('resolvePartialPeriod', () => {
  const now = new Date(2026, 6, 26)

  it('reports the in-progress month for an unbounded (all-time) window', () => {
    expect(resolvePartialPeriod({ start_date: null, end_date: null }, now)).toEqual({
      monthKey: '2026-07',
      label: 'Jul 2026',
      daysElapsed: 26,
      daysTotal: 31,
    })
  })

  it('reports it for a window that ends today (the capped FY range)', () => {
    expect(
      resolvePartialPeriod({ start_date: '2026-04-01', end_date: '2026-07-26' }, now)?.monthKey,
    ).toBe('2026-07')
  })

  it('returns null for a window entirely in the past', () => {
    expect(
      resolvePartialPeriod({ start_date: '2026-04-01', end_date: '2026-06-30' }, now),
    ).toBeNull()
  })

  it('returns null for a window entirely in the future', () => {
    expect(
      resolvePartialPeriod({ start_date: '2026-08-01', end_date: '2026-08-31' }, now),
    ).toBeNull()
  })

  it('returns null on the last day of the month -- every calendar day exists', () => {
    expect(
      resolvePartialPeriod({ start_date: null, end_date: null }, new Date(2026, 6, 31)),
    ).toBeNull()
  })

  it('ignores a time component on the range bounds', () => {
    expect(
      resolvePartialPeriod(
        { start_date: '2026-07-01T00:00:00', end_date: '2026-07-26T23:59:59' },
        now,
      )?.daysElapsed,
    ).toBe(26)
  })
})

describe('toCompleteMonthsRange', () => {
  const now = new Date(2026, 6, 26)

  it('pulls a window that runs into the current month back to last month-end', () => {
    expect(toCompleteMonthsRange({ start_date: '2026-04-01', end_date: '2026-07-26' }, now)).toEqual(
      { start_date: '2026-04-01', end_date: '2026-06-30' },
    )
  })

  it('bounds an unbounded (all-time) window at last month-end', () => {
    expect(toCompleteMonthsRange({ start_date: null, end_date: null }, now)).toEqual({
      start_date: null,
      end_date: '2026-06-30',
    })
  })

  it('returns the same object when the window is already complete', () => {
    const range = { start_date: '2026-04-01', end_date: '2026-06-30' }
    expect(toCompleteMonthsRange(range, now)).toBe(range)
  })

  it('returns null when the selection holds no complete month', () => {
    // User explicitly picked the current month: there is nothing to compare.
    expect(toCompleteMonthsRange({ start_date: '2026-07-01', end_date: '2026-07-26' }, now)).toBeNull()
  })

  it('preserves extra fields on the range object', () => {
    expect(
      toCompleteMonthsRange(
        { start_date: '2026-04-01', end_date: '2026-07-26', label: 'FY 2026-27' },
        now,
      ),
    ).toEqual({ start_date: '2026-04-01', end_date: '2026-06-30', label: 'FY 2026-27' })
  })

  it('does not mutate the input', () => {
    const range = { start_date: '2026-04-01', end_date: '2026-07-26' }
    toCompleteMonthsRange(range, now)
    expect(range.end_date).toBe('2026-07-26')
  })

  it('is a no-op on the last day of the month', () => {
    const range = { start_date: null, end_date: null }
    expect(toCompleteMonthsRange(range, new Date(2026, 6, 31))).toBe(range)
  })
})

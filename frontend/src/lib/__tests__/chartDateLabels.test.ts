import { describe, expect, it } from 'vitest'

import { chartDateKey, formatChartDate, formatChartPeriod } from '../chartDateLabels'
import { formatBucketLabel, formatDisplayPeriod } from '../chartPeriodUtils'
import { formatDateTick } from '../formatters'

describe('year-aware chart labels', () => {
  it('distinguishes repeated months across years, including sparse series', () => {
    expect(formatChartPeriod('2025-01')).toBe('Jan ’25')
    expect(formatChartPeriod('2026-01')).toBe('Jan ’26')
    expect(formatDateTick('2025-12-31', 2)).toBe('Dec 31 ’25')
    expect(formatDateTick('2026-01-01', 2)).toBe('Jan 1 ’26')
    expect(formatDateTick('2026-01-01', 700)).toBe('Jan ’26')
  })

  it('keeps the local calendar day, month and leap day', () => {
    expect(formatChartDate('2024-02-29')).toBe('February 29, 2024')
    expect(formatChartDate('2026-01-01T00:00:00Z')).toBe('January 1, 2026')
    expect(formatChartDate('2026-01')).toBe('January 2026')
  })

  it('normalizes existing formatted month labels and full years', () => {
    for (const month of ['Jan 26', 'Jan 2026', "Jan '26", 'Jan ’26']) {
      expect(formatChartPeriod(month)).toBe('Jan ’26')
      expect(formatChartDate(month)).toBe('January 2026')
      expect(chartDateKey(month)).toBe('2026-01-01')
    }
    expect(formatChartPeriod('Sept 26')).toBe('Sep ’26')
  })

  it('keeps ISO week year instead of the year of its first day', () => {
    expect(formatBucketLabel('2026-W01', 'week')).toBe('Wk 01 ’26')
    expect(formatChartDate('2026-W01')).toBe('Week 1, 2026')
    expect(chartDateKey('2026-W01')).toBe('2025-12-29')
    expect(formatBucketLabel('2026-01-01', 'day')).toBe('Jan 1 ’26')
    expect(formatBucketLabel('2026-01', 'month')).toBe('Jan ’26')
    expect(formatDisplayPeriod('01', 'yearly', 2026)).toBe('Jan ’26')
  })

  it('does not invent dates for invalid input, numeric buckets or categories', () => {
    for (const value of ['2025-02-29', '2026-13', 'Jan', '01', 'Food', '2026-Q1', '']) {
      expect(chartDateKey(value)).toBeNull()
      expect(formatChartPeriod(value)).toBe(value)
      expect(formatChartDate(value)).toBe(value)
    }
  })
})

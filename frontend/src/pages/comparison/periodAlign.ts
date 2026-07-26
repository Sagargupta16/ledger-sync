import { addDaysToKey, inclusiveDaySpan, toLocalDateKey } from '@/lib/dateUtils'

export interface DateSpan {
  readonly start: string
  readonly end: string
}

export interface AlignedSpans {
  readonly a: DateSpan
  readonly b: DateSpan
  /** Set when B was still in progress and both spans were truncated to match. */
  readonly partial: { readonly daysElapsed: number; readonly daysTotal: number } | null
}

/**
 * Truncate two comparison spans to the same number of elapsed days when the
 * later one is still in progress.
 *
 * Without this, every comparison against a current period is a calendar
 * artifact rather than a behavioural signal: 26 days of July against 31 days of
 * June reads as "spending down 16%", and a year-to-date column against a full
 * prior year reads as a 43% collapse in income. Both spans are cut to the same
 * day-of-period so the delta means something, and the caller is handed the
 * elapsed/total counts so it can say on screen what was cut.
 *
 * Works for any span length, so month, calendar-year and fiscal-year modes all
 * share one implementation.
 */
export function alignToElapsed(
  rangeA: DateSpan,
  rangeB: DateSpan,
  today: string = toLocalDateKey(new Date()),
): AlignedSpans {
  // B already finished, or has not begun -- nothing to align either way.
  if (rangeB.end <= today || rangeB.start > today) {
    return { a: rangeA, b: rangeB, partial: null }
  }

  const daysElapsed = inclusiveDaySpan(rangeB.start, today)
  const daysTotal = inclusiveDaySpan(rangeB.start, rangeB.end)

  // Same day-of-period in A. Clamp so a shorter A (a 28-day February against a
  // 31-day month, or a partial first FY) is never extended past its own end.
  const alignedAEnd = addDaysToKey(rangeA.start, daysElapsed - 1)
  return {
    a: { start: rangeA.start, end: alignedAEnd < rangeA.end ? alignedAEnd : rangeA.end },
    b: { start: rangeB.start, end: today },
    partial: { daysElapsed, daysTotal },
  }
}

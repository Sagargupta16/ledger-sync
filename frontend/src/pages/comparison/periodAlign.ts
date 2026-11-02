import { addDaysToKey, inclusiveDaySpan, getTodayKey } from '@/lib/dateUtils'

export interface DateSpan {
  readonly start: string
  readonly end: string
}

interface AlignedSpans {
  readonly a: DateSpan
  readonly b: DateSpan
  /** Set when a span was still in progress and both spans were truncated to match. */
  readonly partial: { readonly daysElapsed: number; readonly daysTotal: number } | null
  /** The running span `partial` describes (the one with fewer elapsed days when both run). */
  readonly runningSide: 'a' | 'b' | null
}

/**
 * Truncate two comparison spans to the same number of elapsed days when either
 * one is still in progress.
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
  today: string = getTodayKey(),
): AlignedSpans {
  const inProgress = (span: DateSpan) => span.end > today && span.start <= today
  const elapsed = (span: DateSpan) => inclusiveDaySpan(span.start, today)
  const runningA = inProgress(rangeA)
  const runningB = inProgress(rangeB)
  // Both finished, or either not begun -- nothing to align either way.
  if ((!runningA && !runningB) || rangeA.start > today || rangeB.start > today) {
    return { a: rangeA, b: rangeB, partial: null, runningSide: null }
  }

  // When both run, the smaller elapsed count is the one both can supply.
  let side: 'a' | 'b' = 'b'
  if (runningA && (!runningB || elapsed(rangeA) < elapsed(rangeB))) side = 'a'
  const lead = side === 'a' ? rangeA : rangeB
  const daysElapsed = elapsed(lead)
  const daysTotal = inclusiveDaySpan(lead.start, lead.end)

  // Same day-of-period in each span. Clamp so a shorter span (a 28-day February
  // against a 31-day month, or a partial first FY) is never extended past its own end.
  const cut = (span: DateSpan): DateSpan => {
    const end = addDaysToKey(span.start, daysElapsed - 1)
    return { start: span.start, end: end < span.end ? end : span.end }
  }
  return { a: cut(rangeA), b: cut(rangeB), partial: { daysElapsed, daysTotal }, runningSide: side }
}

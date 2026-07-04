import type { PresetPeriod } from './components/PeriodPicker'

/**
 * Map a preset period to an ISO date-range. All ranges are inclusive of the
 * end date and use browser-local dates rather than UTC -- consistent with how
 * users think about a month ("June" = the whole calendar month, not a
 * UTC-shifted window).
 *
 * For preset='custom', pass customStart/customEnd (YYYY-MM-DD strings from
 * the date inputs). For preset='all_time', the caller passes minDate/maxDate
 * from useDataDateRange so we don't have to invent an artificial floor.
 */
export function toPeriodRange(
  period: PresetPeriod,
  opts?: {
    customStart?: string
    customEnd?: string
    minDate?: string
    maxDate?: string
  },
): { start: string; end: string } {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) // last day of current month
  let start: Date

  switch (period) {
    case 'last_3_months':
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      break
    case 'last_6_months':
      start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      break
    case 'last_2_years':
      start = new Date(now.getFullYear() - 2, now.getMonth() + 1, 1)
      break
    case 'last_5_years':
      start = new Date(now.getFullYear() - 5, now.getMonth() + 1, 1)
      break
    case 'all_time':
      // Fall back to a wide window when the caller hasn't provided real bounds
      // yet (data-date-range still loading). Backend will clamp.
      return {
        start: opts?.minDate ?? new Date(2000, 0, 1).toISOString(),
        end: opts?.maxDate ?? end.toISOString(),
      }
    case 'this_fy':
      // Indian FY: April to March. If current month < April, we're in the FY
      // that started in the previous calendar year.
      start =
        now.getMonth() < 3
          ? new Date(now.getFullYear() - 1, 3, 1)
          : new Date(now.getFullYear(), 3, 1)
      break
    case 'custom':
      // Guard: if custom fields aren't set yet, fall back to Last 12 mo.
      // Caller UI prevents applying 'custom' without both dates, but the
      // fallback stops the query from returning a broken 422 in edge cases.
      if (opts?.customStart && opts?.customEnd) {
        // customStart/customEnd are YYYY-MM-DD; append time so the end-of-day
        // is included (matches the "last day 23:59:59" convention above).
        return {
          start: new Date(opts.customStart + 'T00:00:00').toISOString(),
          end: new Date(opts.customEnd + 'T23:59:59').toISOString(),
        }
      }
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      break
    case 'last_12_months':
    default:
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      break
  }

  return { start: start.toISOString(), end: end.toISOString() }
}

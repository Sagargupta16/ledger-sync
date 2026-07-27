import { toLocalDateKey } from '@/lib/dateUtils'
import type { PresetPeriod } from './components/PeriodPicker'

/**
 * Map a preset period to an inclusive `YYYY-MM-DD` date range in the user's own
 * calendar.
 *
 * Every branch used to end in `.toISOString()`, which the docstring already
 * claimed was local but is not: it reprojects the local instant to UTC. In IST
 * (UTC+5:30) `new Date(2025, 7, 1)` -- local 1 August -- serialises as
 * `2025-07-31T18:30:00.000Z`, so "Last 12 months" silently reached back one day
 * further than the label says AND lost the last 5.5 hours of the final day.
 * Every user east of Greenwich got a window offset from the one they picked.
 *
 * Date keys avoid the whole class of bug: `date` is stored midnight-local by the
 * ingest normaliser (verified: every row in a 7,338-row ledger has time
 * 00:00:00), FastAPI parses a bare `YYYY-MM-DD` into naive midnight, and the
 * comparison is then day-granular on both sides with no zone in play. It also
 * matches what `useDataDateRange` already returns, so `minDate`/`maxDate` and
 * the computed presets are finally the same shape -- previously the two mixed
 * `YYYY-MM-DD` and full ISO instants in the same two fields.
 *
 * For preset='custom', pass customStart/customEnd (YYYY-MM-DD strings from the
 * date inputs). For preset='all_time', the caller passes minDate/maxDate from
 * useDataDateRange so we don't have to invent an artificial floor.
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
  // Last day of the current month, in local time. Day 0 of the next month.
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
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
        start: opts?.minDate ?? '2000-01-01',
        end: opts?.maxDate ?? toLocalDateKey(end),
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
        // Already `YYYY-MM-DD` from the date inputs -- pass them through rather
        // than round-tripping through Date, which is where the shift crept in.
        return { start: opts.customStart, end: opts.customEnd }
      }
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      break
    case 'last_12_months':
    default:
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      break
  }

  return { start: toLocalDateKey(start), end: toLocalDateKey(end) }
}

import type { PresetPeriod } from './components/PeriodPicker'

/**
 * Map a preset period to an ISO date-range. All ranges are inclusive of the
 * end date and use browser-local dates rather than UTC -- consistent with how
 * users think about a month ("June" = the whole calendar month, not a
 * UTC-shifted window).
 */
export function toPeriodRange(period: PresetPeriod): { start: string; end: string } {
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
    case 'this_fy':
      // Indian FY: April to March. If current month < April, we're in the FY
      // that started in the previous calendar year.
      start =
        now.getMonth() < 3
          ? new Date(now.getFullYear() - 1, 3, 1)
          : new Date(now.getFullYear(), 3, 1)
      break
    case 'last_12_months':
    default:
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      break
  }

  return { start: start.toISOString(), end: end.toISOString() }
}

/**
 * Advance tax instalment dates as calendar markers. The amount depends on the
 * year's projected tax and TDS, which the Income Tax page works out, so a
 * marker carries no money and stays outside every total; it links there.
 */

import { ROUTES } from '@/constants'
import { advanceTaxDueDates } from '@/lib/tax/advanceTaxRules'
import { parseLocalDate } from '@/lib/dateUtils'

import type { PlacedBill } from './types'

/** Why the marker shows when nothing may be owed. */
export const ADVANCE_TAX_NOTE = 'Due only when your tax after TDS is ₹10,000 or more'

/** The advance tax dates in one month (0-indexed, like `Date`), keyed by day. */
export function buildAdvanceTaxMap(year: number, month: number): Map<number, PlacedBill[]> {
  // An April-to-March tax year: January to March belong to the year before.
  const taxYearStart = month >= 3 ? year : year - 1
  const map = new Map<number, PlacedBill[]>()
  for (const due of advanceTaxDueDates(taxYearStart)) {
    const date = parseLocalDate(due.date)
    if (date.getFullYear() !== year || date.getMonth() !== month) continue
    const day = date.getDate()
    map.set(day, [
      ...(map.get(day) ?? []),
      {
        key: `advance-tax-${due.date}`,
        name: due.label,
        amount: 0,
        category: 'Income tax',
        frequency: null,
        type: 'Expense',
        day,
        source: 'tax',
        informational: true,
        note: ADVANCE_TAX_NOTE,
        href: ROUTES.TAX_PLANNING,
      },
    ])
  }
  return map
}

/**
 * Demo port of the backend's unusual-category detector
 * (`_detect_unusual_categories` in `core/analytics/anomaly_baselines.py`): a
 * category's month against its own trailing-year months, graded like a
 * high-expense month, with the same materiality floor, single-expense and
 * new-level rules, and the longer-than-monthly-bill auto-dismiss.
 */

import { medianOf } from '@/lib/distribution'
import type { Transaction } from '@/types'

import {
  groupBy,
  MIN_HISTORY,
  money,
  MONTH_NAMES,
  monthIndex,
  periodOf,
  total,
  type DemoFinding,
} from './demoAnomalyDetectors'
import { grade } from './demoAnomalyStats'

/** What a month's rows paid on a longer-than-monthly recurring schedule. */
export type ScheduleExplainer = (rows: readonly Transaction[]) => { paid: number; names: string[] }

/** One category month and the inputs `_judge_category_month` grades it with. */
interface CategoryMonth {
  category: string
  month: number
  members: readonly Transaction[]
  sum: number
  window: readonly number[]
}

const cents = (value: number) => Math.round(value * 100)

/** "Sep 2026", the backend's `%b %Y`. */
const monthLabel = (month: number) => `${MONTH_NAMES[month % 12]} ${Math.floor(month / 12)}`

/** `_judge_category_month`: a material, outlying month no single flagged expense explains. */
function judgeCategoryMonth(
  { category, month, members, sum, window }: CategoryMonth,
  scale: (month: number) => number,
  flagged: ReadonlySet<string>,
): DemoFinding | null {
  const med = medianOf(window)
  if (med <= 0 || sum - med < 0.02 * scale(month)) return null
  const severity = grade(sum, window)
  const single = total(members.filter((t) => flagged.has(t.id)))
  if (!severity || (single > 0 && grade(sum - single, window) === null)) return null
  const period = periodOf(month)
  return {
    type: 'unusual_category',
    severity,
    description: `Unusual spending in ${category}: ${money(sum)} in ${monthLabel(month)} vs a typical ${money(med)} a month`,
    transaction_id: null,
    period_key: period,
    expected_value: med,
    actual_value: sum,
    deviation_pct: ((sum - med) / med) * 100,
    when: `${period}-01`,
  }
}

/** `_explain_by_schedule`: dismissed when a longer-than-monthly bill explains the month. */
function explainedBy(explain: ScheduleExplainer | undefined, { members, sum, window }: CategoryMonth) {
  const scheduled = explain?.(members)
  if (!scheduled || scheduled.paid <= 0 || grade(sum - scheduled.paid, window) !== null) return undefined
  return `Auto-dismissed: explained by the recurring ${scheduled.names.join(', ')}.`
}

export function unusualCategories(
  expenses: readonly Transaction[],
  scale: (month: number) => number,
  flagged: ReadonlySet<string>,
  explain?: ScheduleExplainer,
): DemoFinding[] {
  const found: DemoFinding[] = []
  for (const [category, rows] of groupBy(expenses, (t) => t.category)) {
    const byMonth = groupBy(rows, (t) => monthIndex(t.date))
    const totals = new Map([...byMonth].map(([month, list]) => [month, total(list)]))
    for (const [month, members] of byMonth) {
      const sum = totals.get(month) ?? 0
      const window = [...totals].filter(([m]) => m >= month - 12 && m < month).map(([, v]) => v)
      // `_repeats_previous`: the month before's exact total again is a new level.
      const previous = totals.get(month - 1)
      if (window.length < MIN_HISTORY || (previous !== undefined && cents(previous) === cents(sum))) {
        continue
      }
      const subject: CategoryMonth = { category, month, members, sum, window }
      const finding = judgeCategoryMonth(subject, scale, flagged)
      if (finding) found.push({ ...finding, autoDismiss: explainedBy(explain, subject) })
    }
  }
  return found
}

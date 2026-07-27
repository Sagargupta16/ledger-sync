import type { Transaction } from '@/types'

export interface CategoryData {
  name: string
  total: number
  percent: number
  color: string
  /** Last-12-months total spending in this category, oldest -> newest. */
  monthlyHistory: number[]
  subcategories: { name: string; amount: number; percent: number }[]
}

/**
 * The last 12 calendar-month keys (YYYY-MM), oldest first, ending in the
 * current month. Built from LOCAL date components so the keys match
 * ``tx.date.substring(0, 7)`` for the viewer's timezone -- the same window the
 * backend ``/category-monthly-history`` endpoint buckets into.
 */
export function trailingMonthKeys(count = 12): string[] {
  const now = new Date()
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

/**
 * Build a Map<categoryName, [m1, m2, ..., m12]> covering the last 12
 * calendar months ending in the current month, oldest first. Months
 * with no spending get a 0 so the sparkline renders a meaningful flat
 * segment instead of skipping the bucket.
 */
export function buildMonthlyHistoryByCategory(
  transactions: Transaction[],
  transactionType: 'income' | 'expense',
): Map<string, number[]> {
  const buckets = new Map<string, number[]>()
  if (transactions.length === 0) return buckets

  // Build the list of last-12 month keys (YYYY-MM), oldest first.
  // Use LOCAL accessors consistently: the Date is built from local components
  // (new Date(year, month, 1)), so reading it back with getUTC* shifted the key
  // a day -- and thus a month -- earlier for positive-offset (IST) users, so the
  // current month's spending was dropped/mislabelled vs tx.date.substring(0,7).
  const now = new Date()
  const monthKeys: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const monthIndex = new Map(monthKeys.map((k, i) => [k, i]))

  const wantedType = transactionType === 'expense' ? 'Expense' : 'Income'

  for (const tx of transactions) {
    if (tx.type !== wantedType) continue
    const category = tx.category
    if (!category) continue
    const monthKey = (tx.date as string).substring(0, 7)
    const idx = monthIndex.get(monthKey)
    if (idx === undefined) continue
    const series = buckets.get(category) ?? Array.from({ length: 12 }, () => 0)
    series[idx] += Math.abs(tx.amount)
    buckets.set(category, series)
  }
  return buckets
}

/**
 * Average spend per active month for a category, derived from its trailing
 * 12-month series. Divides by the count of months that actually had spend
 * (not all 12) so a category active for 3 months isn't diluted by 9 zeros.
 * Returns 0 when the series is empty or all-zero.
 */
export function averagePerActiveMonth(monthlyHistory: number[]): number {
  const active = monthlyHistory.filter((m) => m > 0)
  if (active.length === 0) return 0
  return active.reduce((sum, m) => sum + m, 0) / active.length
}

/**
 * Row label for {@link averagePerActiveMonth}, naming the divisor it used.
 *
 * The label was the flat string "<amount>/mo avg", sitting inches from a
 * sparkline titled "last 12 months", while the divisor was only the months that
 * HAD spend. A category with spend in 2 of 12 months therefore advertised a
 * figure 6x its own 12-month monthly average as if it were one -- and the
 * sparser the category, the bigger the overstatement.
 *
 * The mean itself is a legitimate statistic (it answers "when I do spend on
 * this, how much per month?"), so the divisor travels with the number instead,
 * exactly as `monthlyAvgLineLabelFor` does for the Expense Trend reference line.
 * Kept to "mo" abbreviations because this renders at 11px inside a row that also
 * carries the name, percentage, amount and sparkline.
 *
 * The AMOUNT LEADS the string on purpose. The meta line is `truncate` inside a
 * `min-w-0` flex child, so on a phone the tail is what gets cut -- putting the
 * qualifier last means an ellipsis eats "in 3 of 12 mo", never half of the
 * digits (the `₹12,91` class this repo already paid for once).
 *
 * Returns `null` when there is nothing to average, so callers can drop the
 * clause entirely rather than print a zero.
 */
export function monthlyAvgLabel(
  monthlyHistory: number[],
  formatMoney: (value: number) => string,
): string | null {
  const average = averagePerActiveMonth(monthlyHistory)
  if (average <= 0) return null
  const total = monthlyHistory.length
  const active = monthlyHistory.filter((m) => m > 0).length
  return active < total
    ? `${formatMoney(average)}/mo in ${active} of ${total} mo`
    : `${formatMoney(average)}/mo over ${total} mo`
}

export function buildCategories(
  categoryData: { categories?: Record<string, Record<string, unknown>> } | undefined,
  colorMap: Record<string, string> | undefined,
  defaultColors: readonly string[],
  monthlyHistoryByCategory: Map<string, number[]>,
  categoryFilter: string | null | undefined,
): { categories: CategoryData[]; grandTotal: number } {
  if (!categoryData?.categories) return { categories: [], grandTotal: 0 }

  const total = Object.values(categoryData.categories)
    .reduce((sum, catData: Record<string, unknown>) => sum + Math.abs(catData.total as number), 0)

  let colorIdx = 0
  const cats: CategoryData[] = Object.entries(categoryData.categories)
    .map(([category, catData]: [string, Record<string, unknown>]) => {
      const catTotal = Math.abs(catData.total as number)
      const color = colorMap?.[category] ?? defaultColors[colorIdx % defaultColors.length]
      colorIdx++

      // Build subcategory list
      const subs: CategoryData['subcategories'] = []
      if (catData.subcategories) {
        Object.entries(catData.subcategories as Record<string, number>)
          .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
          .forEach(([subcat, amount]) => {
            subs.push({
              name: subcat,
              amount: Math.abs(amount),
              percent: catTotal > 0 ? (Math.abs(amount) / catTotal) * 100 : 0,
            })
          })
      }

      return {
        name: category,
        total: catTotal,
        percent: total > 0 ? (catTotal / total) * 100 : 0,
        color,
        monthlyHistory: monthlyHistoryByCategory.get(category) ?? [],
        subcategories: subs,
      }
    })
    .sort((a, b) => b.total - a.total)

  // When a category filter is active, narrow the visible set to that
  // single category. Falls back to full list if the filter doesn't
  // match any category (e.g. stale URL after category renamed).
  const filtered = categoryFilter
    ? cats.filter((c) => c.name === categoryFilter)
    : cats
  const visible = filtered.length > 0 ? filtered : cats

  return { categories: visible, grandTotal: total }
}

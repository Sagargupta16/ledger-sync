import { ROLLING_AVG_MONTHS } from '@/lib/chartUtils'
import type { IncomeAnalysisData } from '@/services/api/calculations'
import type { Transaction } from '@/types'

import { filterByDateRange, isIncome, monthKey, sum } from './demoHelpers'

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * `cashback_categories` reaches the demo adapter as the raw array the query
 * hook passed (the FastAPI repeat-per-item serializer only runs on the wire),
 * so accept the list form and tolerate a lone string.
 */
function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return typeof value === 'string' ? [value] : []
}

/**
 * Mirrors `/api/calculations/income-analysis`
 * (`calculations_helpers._compute_income_analysis`).
 *
 * Without this route the demo adapter fell through to its `[]` catch-all, so
 * every figure on the Income Analysis page -- total, category donut, trend,
 * cashback, peak, growth -- rendered as 0 for the first-time visitor.
 *
 * The one subtlety worth preserving is the rolling average: the backend returns
 * `income_avg_3m: null` for any month without a full `ROLLING_AVG_MONTHS` window
 * behind it, rather than dividing a short window by its own length and calling
 * the result a 3-month mean. Demo mode has to abstain in exactly the same
 * places, or the shop window shows a trend line the real app withholds.
 */
export function generateDemoIncomeAnalysis(
  txs: Transaction[],
  params: Record<string, unknown>,
): IncomeAnalysisData {
  const category = asString(params.category)
  let rows = filterByDateRange(txs, asString(params.start_date), asString(params.end_date)).filter(
    isIncome,
  )
  if (category) rows = rows.filter((t) => t.category === category)

  // `Math.abs` throughout, matching the endpoint: it sums magnitudes so a
  // credit stored with either sign reads the same.
  const totalIncome = sum(rows.map((t) => Math.abs(t.amount)))

  const byCategory: Record<string, number> = {}
  for (const t of rows) {
    const key = t.category || 'Other Income'
    byCategory[key] = (byCategory[key] ?? 0) + Math.abs(t.amount)
  }

  const byMonth = new Map<string, number>()
  for (const t of rows) {
    const key = monthKey(t.date)
    byMonth.set(key, (byMonth.get(key) ?? 0) + Math.abs(t.amount))
  }
  const sortedMonths = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const monthlyData = sortedMonths.map(([month, income], i) => ({
    month,
    income,
    income_avg_3m:
      i + 1 >= ROLLING_AVG_MONTHS
        ? sum(sortedMonths.slice(i + 1 - ROLLING_AVG_MONTHS, i + 1).map(([, amount]) => amount)) /
          ROLLING_AVG_MONTHS
        : null,
  }))

  // Cashback = income rows whose `Category::Subcategory` is in the user's
  // non-taxable list, matched case-insensitively -- the same rule as the
  // endpoint, which owns no preference fallback of its own.
  const wanted = new Set(asStringList(params.cashback_categories).map((c) => c.toLowerCase()))
  const cashbacksTotal = sum(
    rows
      .filter((t) => wanted.has(`${t.category || ''}::${t.subcategory ?? ''}`.toLowerCase()))
      .map((t) => Math.abs(t.amount)),
  )

  const incomes = monthlyData.map((m) => m.income)
  const nonZero = incomes.filter((value) => value > 0)
  const first = nonZero[0]

  return {
    total_income: totalIncome,
    category_breakdown: byCategory,
    monthly_data: monthlyData,
    cashbacks_total: cashbacksTotal,
    peak_income: incomes.length > 0 ? Math.max(...incomes) : 0,
    growth_rate:
      nonZero.length >= 2 && first ? ((nonZero.at(-1)! - first) / first) * 100 : 0,
  }
}

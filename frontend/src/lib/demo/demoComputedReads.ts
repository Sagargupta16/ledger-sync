import type { DataHealth } from '@/services/api/analyticsV2'
import type { CapitalLossCandidate } from '@/services/api/analyticsV2DataHealth'
import type { IncomeFacetsData, QuickInsightsData } from '@/services/api/calculations'
import type { TransactionFacets } from '@/services/api/transactions'
import { toLocalDateKey } from '@/lib/dateUtils'
import { looksLikeCapitalLoss } from '@/lib/expenseClassification'
import type { Transaction } from '@/types'

import { isDemoCapitalLoss } from './demoCalculations'
import { filterByDateRange, isExpense, isIncome, isTransfer } from './demoHelpers'
import { filterDemoTransactions } from './demoTxFilters'

/**
 * Server-computed read endpoints, reproduced client-side from the demo
 * ledger so every page renders with real-looking data in demo mode.
 * (The axios demo adapter routes GETs here instead of the network.)
 *
 * Split by topic: daily/cohort reads live in `demoDailyReads`, money-movement
 * reads in `demoFlowReads`, the 50/30/20 rule in `demoSpendingRule`, and the
 * account/saved-view fixtures in `demoAccountReads`.
 */

export function generateDemoFacets(txs: Transaction[]): TransactionFacets {
  // Mirror the backend split: a category only ever seen on transfers is a
  // routing label, not a spending category. Same rule, so demo mode and real
  // mode cannot disagree about which list a category lands in.
  const nonTransferCategories = new Set(txs.filter((t) => !isTransfer(t)).map((t) => t.category))
  const allCategories = [...new Set(txs.map((t) => t.category))].sort((a, b) => a.localeCompare(b))
  const categories = allCategories.filter((c) => nonTransferCategories.has(c))
  const transferCategories = allCategories.filter((c) => !nonTransferCategories.has(c))
  const accounts = [...new Set(txs.map((t) => t.account))].sort((a, b) => a.localeCompare(b))
  const tagCounts = new Map<string, number>()
  for (const t of txs) {
    for (const tag of t.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  return {
    categories,
    transfer_categories: transferCategories,
    accounts,
    tags: [...tagCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    income_count: txs.filter(isIncome).length,
    expense_count: txs.filter(isExpense).length,
    transfer_count: txs.filter(isTransfer).length,
    total_count: txs.length,
  }
}

/**
 * Mirrors /api/transactions/search filtering closely enough for the demo.
 *
 * The filter predicate itself lives in `demoTxFilters` because `/export` takes
 * the same params from the same page -- a rule applied here and not there would
 * make the demo CSV disagree with the table it came from.
 */
export function generateDemoSearch(
  txs: Transaction[],
  params: Record<string, unknown>,
): { data: Transaction[]; total: number; limit: number; offset: number; has_more: boolean } {
  const rows = filterDemoTransactions(txs, params)

  const limit = Number(params.limit) || 100
  const offset = Number(params.offset) || 0
  return {
    data: rows.slice(offset, offset + limit),
    total: rows.length,
    limit,
    offset,
    has_more: offset + limit < rows.length,
  }
}

export function generateDemoDataDateRange(txs: Transaction[]): {
  min_date: string | null
  max_date: string | null
} {
  if (txs.length === 0) return { min_date: null, max_date: null }
  // txs arrive sorted newest-first.
  return { min_date: txs.at(-1)?.date ?? null, max_date: txs[0].date }
}

/** Mirrors /api/calculations/income-facets: income buckets with count + sum. */
export function generateDemoIncomeFacets(txs: Transaction[]): IncomeFacetsData {
  const buckets = new Map<
    string,
    { category: string; subcategory: string; total: number; count: number }
  >()
  for (const t of txs.filter(isIncome)) {
    const category = t.category || 'Uncategorized'
    const subcategory = t.subcategory || 'Other'
    const key = `${category}::${subcategory}`
    const bucket = buckets.get(key) ?? { category, subcategory, total: 0, count: 0 }
    bucket.total += Math.abs(t.amount)
    bucket.count += 1
    buckets.set(key, bucket)
  }
  return { facets: [...buckets.values()] }
}

/**
 * Notes the importer writes when the source file gave it nothing usable. These
 * are counted as placeholders because they carry an amount and no description,
 * which is what makes merchant and subscription detection miss the row.
 */
const PLACEHOLDER_NOTES = new Set(['', '-', 'na', 'n/a', 'unknown', 'miscellaneous', 'other'])

/** Categories that mean "we did not work out where this belongs". */
const CATCH_ALL_CATEGORIES = new Set(['Miscellaneous', 'Uncategorized', 'Other', 'Unknown'])

/**
 * Mirrors `_unclassified_capital_losses`: Expense taxonomies the detector flags
 * and the demo user has not classified, largest total first.
 */
function demoCapitalLossCandidates(txs: Transaction[]): CapitalLossCandidate[] {
  const byKey = new Map<string, CapitalLossCandidate>()
  for (const t of txs) {
    if (!isExpense(t) || isDemoCapitalLoss(t) || !looksLikeCapitalLoss(t)) continue
    const key = `${t.category}::${t.subcategory ?? ''}`
    const entry = byKey.get(key) ?? {
      category: t.category,
      subcategory: t.subcategory ?? null,
      key,
      transaction_count: 0,
      total_amount: 0,
    }
    entry.transaction_count += 1
    entry.total_amount += t.amount
    byKey.set(key, entry)
  }
  return [...byKey.values()].sort((a, b) => b.total_amount - a.total_amount)
}

/**
 * Mirrors /api/analytics/v2/data-health.
 *
 * Every count is measured off the demo ledger rather than hardcoded, so the
 * numbers stay consistent with the rows the rest of demo mode is showing. The
 * import-log fields describe the one synthetic import that produced this ledger:
 * it was generated in full just now, so nothing was skipped and nothing is stale.
 */
export function generateDemoDataHealth(txs: Transaction[]): DataHealth {
  const now = new Date()
  const today = toLocalDateKey(now)

  // txs arrive sorted newest-first.
  const latest = txs[0]?.date ?? null
  const earliest = txs.at(-1)?.date ?? null

  const placeholderNotes = txs.filter((t) =>
    PLACEHOLDER_NOTES.has((t.note ?? '').trim().toLowerCase()),
  ).length
  const uncategorized = txs.filter((t) => CATCH_ALL_CATEGORIES.has(t.category)).length
  const futureDated = txs.filter((t) => t.date > today).length
  const candidates = demoCapitalLossCandidates(txs)

  return {
    last_import_at: now.toISOString(),
    days_stale: 0,
    last_import_file_name: 'demo-ledger.xlsx',
    rows_processed: txs.length,
    rows_inserted: txs.length,
    rows_updated: 0,
    rows_skipped: 0,
    // Demo rollups are computed from the same in-memory rows on every read, so
    // they cannot lag the import the way the server-side tables can.
    rollups_calculated_at: now.toISOString(),
    rollups_stale: false,
    transaction_count: txs.length,
    earliest_date: earliest,
    latest_date: latest,
    future_dated_count: futureDated,
    placeholder_note_count: placeholderNotes,
    uncategorized_count: uncategorized,
    capital_loss_candidates: candidates,
    capital_loss_candidate_count: candidates.reduce((s, c) => s + c.transaction_count, 0),
    capital_loss_candidate_amount: candidates.reduce((s, c) => s + c.total_amount, 0),
  }
}

/**
 * Mirrors `/api/calculations/quick-insights` (`quick_insights` in backend
 * `services/calculation_service.py`) for the requested window.
 *
 * The date params used to be ignored, so every period answered with the whole
 * 48-month ledger: the Aug-2026 burn rate read 4,130,044 beside a 73,308
 * totals card. Expense stats skip classified losses like `/totals`, and net
 * cashback is the endpoint's rule -- Income rows whose subcategory contains
 * "cashback", minus transfers to a "cashback shared" account. Matching the
 * whole `Refund & Cashbacks` category also counted product refunds.
 */
export function generateDemoQuickInsights(
  allTxs: Transaction[],
  params: Record<string, unknown> = {},
): QuickInsightsData {
  const txs = filterByDateRange(
    allTxs,
    typeof params.start_date === 'string' ? params.start_date : undefined,
    typeof params.end_date === 'string' ? params.end_date : undefined,
  )
  const expenses = txs.filter((t) => isExpense(t) && !isDemoCapitalLoss(t))
  const amounts = expenses.map((t) => t.amount).sort((a, b) => a - b)
  const totalSpending = amounts.reduce((s, a) => s + a, 0)
  const biggest = expenses.reduce(
    (best, t) => (t.amount > best.amount ? { amount: t.amount, category: t.category } : best),
    { amount: 0, category: '' },
  )

  let weekend = 0
  let weekday = 0
  const dayTotals = new Array(7).fill(0) as number[]
  for (const t of expenses) {
    const day = new Date(`${t.date}T00:00:00`).getDay()
    dayTotals[day] += t.amount
    if (day === 0 || day === 6) weekend += t.amount
    else weekday += t.amount
  }
  const peakDay = dayTotals.indexOf(Math.max(...dayTotals))

  const cashbacks = txs.filter(
    (t) => isIncome(t) && (t.subcategory ?? '').toLowerCase().includes('cashback'),
  )
  const transfers = txs.filter(isTransfer)
  const sharedCashback = transfers
    .filter((t) => (t.to_account ?? '').toLowerCase().includes('cashback shared'))
    .reduce((s, t) => s + t.amount, 0)

  const incomeByCategory = new Map<string, number>()
  for (const t of txs.filter(isIncome)) {
    incomeByCategory.set(t.category, (incomeByCategory.get(t.category) ?? 0) + t.amount)
  }
  const topIncome = [...incomeByCategory.entries()].sort((a, b) => b[1] - a[1])[0]

  const monthTotals = new Map<string, number>()
  for (const t of expenses) {
    const mk = t.date.slice(0, 7)
    monthTotals.set(mk, (monthTotals.get(mk) ?? 0) + t.amount)
  }
  const worstMonth = [...monthTotals.entries()].sort((a, b) => b[1] - a[1])[0]

  return {
    min_date: txs.at(-1)?.date ?? null,
    max_date: txs[0]?.date ?? null,
    net_cashback: cashbacks.reduce((s, t) => s + t.amount, 0) - sharedCashback,
    cashback_count: cashbacks.length,
    median_expense: amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0,
    biggest_expense: biggest,
    avg_expense: amounts.length ? totalSpending / amounts.length : 0,
    total_spending: totalSpending,
    expense_count: amounts.length,
    weekend_spending: weekend,
    weekday_spending: weekday,
    peak_day: peakDay,
    peak_day_total: dayTotals[peakDay] ?? 0,
    total_transfers: transfers.reduce((s, t) => s + t.amount, 0),
    transfer_count: transfers.length,
    top_income_source: topIncome ? { category: topIncome[0], amount: topIncome[1] } : null,
    most_expensive_month: worstMonth ? { period: worstMonth[0], amount: worstMonth[1] } : null,
  }
}

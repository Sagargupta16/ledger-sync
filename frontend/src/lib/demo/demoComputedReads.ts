import type {
  CohortSpendingData,
  DailySummary,
  DataHealth,
  InvestmentHolding,
  SpendingBucket,
  SpendingRuleResponse,
  TransferFlow,
} from '@/services/api/analyticsV2'
import type { QuickInsightsData } from '@/services/api/calculations'
import type { SavedView } from '@/services/api/savedViews'
import type { TransactionFacets } from '@/services/api/transactions'
import {
  checkIsInvestmentTransaction,
  checkIsInvestmentWithdrawal,
} from '@/components/analytics/health/healthScoreTypes'
import { isInvestmentAccount } from '@/constants/accountTypes'
import { toLocalDateKey } from '@/lib/dateUtils'
import { shareOfIncomePercent } from '@/lib/savingsRate'
import type { LabelKind, MerchantRow } from '@/pages/merchant-intelligence/types'
import type { Transaction } from '@/types'

import { isExpense, isIncome, isTransfer } from './demoHelpers'
import { filterDemoTransactions } from './demoTxFilters'

/**
 * Server-computed read endpoints, reproduced client-side from the demo
 * ledger so every page renders with real-looking data in demo mode.
 * (The axios demo adapter routes GETs here instead of the network.)
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

/**
 * Notes the importer writes when the source file gave it nothing usable. These
 * are counted as placeholders because they carry an amount and no description,
 * which is what makes merchant and subscription detection miss the row.
 */
const PLACEHOLDER_NOTES = new Set(['', '-', 'na', 'n/a', 'unknown', 'miscellaneous', 'other'])

/** Categories that mean "we did not work out where this belongs". */
const CATCH_ALL_CATEGORIES = new Set(['Miscellaneous', 'Uncategorized', 'Other', 'Unknown'])

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
  }
}

export function generateDemoQuickInsights(txs: Transaction[]): QuickInsightsData {
  const expenses = txs.filter(isExpense)
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

  const cashbacks = txs.filter((t) => isIncome(t) && t.category === 'Refund & Cashbacks')
  const transfers = txs.filter(isTransfer)

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
    net_cashback: cashbacks.reduce((s, t) => s + t.amount, 0),
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

export function generateDemoCohortSpending(txs: Transaction[]): CohortSpendingData {
  const expenses = txs.filter(isExpense)
  const build = (
    keyOf: (d: Date) => number,
    domain: number[],
  ): { bucket: number; total: number; occurrences: number; avg: number }[] => {
    const totals = new Map<number, number>()
    const days = new Map<number, Set<string>>()
    for (const t of expenses) {
      const d = new Date(`${t.date}T00:00:00`)
      const k = keyOf(d)
      totals.set(k, (totals.get(k) ?? 0) + t.amount)
      if (!days.has(k)) days.set(k, new Set())
      days.get(k)?.add(t.date)
    }
    return domain
      .filter((b) => totals.has(b))
      .map((b) => {
        const total = totals.get(b) ?? 0
        const occ = days.get(b)?.size ?? 1
        return { bucket: b, total, occurrences: occ, avg: total / occ }
      })
  }
  return {
    day_of_week: build((d) => d.getDay(), [0, 1, 2, 3, 4, 5, 6]),
    day_of_month: build(
      (d) => d.getDate(),
      Array.from({ length: 31 }, (_, i) => i + 1),
    ),
    month_of_year: build(
      (d) => d.getMonth() + 1,
      Array.from({ length: 12 }, (_, i) => i + 1),
    ),
  }
}

export function generateDemoDailySummaries(txs: Transaction[]): DailySummary[] {
  const byDate = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (!byDate.has(t.date)) byDate.set(t.date, [])
    byDate.get(t.date)?.push(t)
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 90)
    .map(([date, rows]) => {
      const income = rows.filter(isIncome).reduce((s, t) => s + t.amount, 0)
      const expense = rows.filter(isExpense).reduce((s, t) => s + t.amount, 0)
      const catTotals = new Map<string, number>()
      for (const t of rows.filter(isExpense)) {
        catTotals.set(t.category, (catTotals.get(t.category) ?? 0) + t.amount)
      }
      const top = [...catTotals.entries()].sort((a, b) => b[1] - a[1])[0]
      return {
        date,
        income,
        expense,
        net: income - expense,
        income_count: rows.filter(isIncome).length,
        expense_count: rows.filter(isExpense).length,
        transfer_count: rows.filter(isTransfer).length,
        total_transactions: rows.length,
        top_category: top?.[0] ?? null,
      }
    })
}

export function generateDemoTransferFlows(txs: Transaction[]): TransferFlow[] {
  const flows = new Map<string, { total: number; count: number; last: Transaction }>()
  for (const t of txs.filter(isTransfer)) {
    if (!t.from_account || !t.to_account) continue
    const key = `${t.from_account}->${t.to_account}`
    const entry = flows.get(key)
    if (entry) {
      entry.total += t.amount
      entry.count += 1
      if (t.date > entry.last.date) entry.last = t
    } else {
      flows.set(key, { total: t.amount, count: 1, last: t })
    }
  }
  return [...flows.entries()]
    .map(([key, f]) => {
      const [from, to] = key.split('->')
      return {
        from,
        to,
        total: f.total,
        count: f.count,
        avg: f.total / f.count,
        last_date: f.last.date,
        last_amount: f.last.amount,
        from_type: null,
        to_type: null,
      }
    })
    .sort((a, b) => b.total - a.total)
}

/**
 * Mirror of the backend extractor's `label_kind` for a demo merchant label.
 *
 * `extract_merchant()` in `core/analytics/merchant_extract.py` returns
 * `(label, kind)`, and the kind is decided by ONE thing: whether the note was
 * REPLACED by a canonical brand name. A brand match rewrites "Amazon Fashion"
 * to "Amazon"; a miss keeps the whole cleaned note as the descriptor.
 *
 * This generator groups by the raw narration (`t.note`), never by a canonical
 * brand, so its labels are always the note itself -- which is precisely the
 * backend's descriptor case. Returning `'descriptor'` unconditionally is
 * therefore the faithful mirror, not a fallback: claiming `'brand'` for a row
 * labelled "Amazon Fashion" would assert a fold that never happened, and
 * inventing a client-side brand list would be a second, drifting source of
 * truth for a decision the backend already owns.
 */
const DEMO_LABEL_KIND: LabelKind = 'descriptor'

export function generateDemoMerchantIntelligence(txs: Transaction[]): MerchantRow[] {
  const byMerchant = new Map<string, Transaction[]>()
  for (const t of txs.filter(isExpense)) {
    const merchant = t.note ?? t.subcategory ?? t.category
    if (!byMerchant.has(merchant)) byMerchant.set(merchant, [])
    byMerchant.get(merchant)?.push(t)
  }
  return [...byMerchant.entries()]
    .filter(([, rows]) => rows.length >= 3)
    .map(([merchant, rows]) => {
      // `[...rows].sort` rather than `rows.toSorted`: toSorted needs Firefox
      // 115 but Vite's default `baseline-widely-available` target is
      // firefox114, and the repo ships no core-js polyfill, so the method
      // reaches Firefox 114 users undefined. Spread-then-sort is identical --
      // new array, source untouched, and Array#sort is stable per ES2019.
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
      const total = rows.reduce((s, t) => s + t.amount, 0)
      const months = new Set(rows.map((t) => t.date.slice(0, 7))).size
      const first = sorted[0].date
      const last = sorted.at(-1)?.date ?? first
      const spanDays =
        (new Date(last).getTime() - new Date(first).getTime()) / 86_400_000
      return {
        merchant,
        label_kind: DEMO_LABEL_KIND,
        category: rows[0].category,
        subcategory: rows[0].subcategory ?? null,
        total_spent: total,
        transaction_count: rows.length,
        avg_transaction: total / rows.length,
        first_transaction: first,
        last_transaction: last,
        months_active: months,
        avg_days_between: rows.length > 1 ? spanDays / (rows.length - 1) : null,
        is_recurring: months >= 6 && rows.length >= 6,
      }
    })
    .sort((a, b) => b.total_spent - a.total_spent)
    .slice(0, 40)
}

export function generateDemoInvestmentHoldings(txs: Transaction[]): InvestmentHolding[] {
  const investmentAccounts: Record<string, { type: string; growth: number }> = {
    'Groww Mutual Funds': { type: 'mutual_funds', growth: 1.14 },
    'Groww Stocks': { type: 'stocks', growth: 1.11 },
    'PPF Account': { type: 'ppf_epf', growth: 1.071 },
    'EPF Account': { type: 'ppf_epf', growth: 1.0825 },
    'SBI FD': { type: 'fixed_deposits', growth: 1.068 },
  }
  const holdings: InvestmentHolding[] = []
  let id = 1
  for (const [account, meta] of Object.entries(investmentAccounts)) {
    const inflows = txs.filter((t) => isTransfer(t) && t.to_account === account)
    const outflows = txs.filter((t) => isTransfer(t) && t.from_account === account)
    const invested =
      inflows.reduce((s, t) => s + t.amount, 0) - outflows.reduce((s, t) => s + t.amount, 0)
    if (invested <= 0) continue
    // Approximate market value: contributions grew for ~half the horizon on
    // average, at each instrument's indicative annual rate.
    const current = Math.round(invested * Math.pow(meta.growth, 2))
    holdings.push({
      id: id++,
      account,
      investment_type: meta.type,
      instrument_name: null,
      invested_amount: invested,
      current_value: current,
      realized_gains: 0,
      unrealized_gains: current - invested,
      is_active: true,
      last_updated: txs[0]?.date ?? null,
    })
  }
  return holdings
}

/** Trailing per-category monthly totals aligned to the requested month keys. */
export function generateDemoCategoryMonthlyHistory(
  txs: Transaction[],
  months: string[],
  transactionType: 'income' | 'expense',
): Record<string, number[]> {
  const wanted = transactionType === 'income' ? isIncome : isExpense
  const out: Record<string, number[]> = {}
  for (const t of txs) {
    if (!wanted(t)) continue
    const idx = months.indexOf(t.date.slice(0, 7))
    if (idx === -1) continue
    if (!out[t.category]) out[t.category] = new Array(months.length).fill(0) as number[]
    out[t.category][idx] += t.amount
  }
  return out
}

export function generateDemoCategoryDailySeries(
  txs: Transaction[],
  params: Record<string, unknown>,
): { data: { date: string; category: string; subcategory: string; amount: number }[]; transaction_count: number } {
  let rows = txs.filter(params.transaction_type === 'income' ? isIncome : isExpense)
  if (params.start_date) rows = rows.filter((t) => t.date >= (params.start_date as string))
  if (params.end_date) rows = rows.filter((t) => t.date <= (params.end_date as string))
  if (params.category) rows = rows.filter((t) => t.category === params.category)
  const agg = new Map<string, number>()
  for (const t of rows) {
    const key = `${t.date}|${t.category}|${t.subcategory ?? ''}`
    agg.set(key, (agg.get(key) ?? 0) + t.amount)
  }
  return {
    data: [...agg.entries()].map(([key, amount]) => {
      const [date, category, subcategory] = key.split('|')
      return { date, category, subcategory, amount }
    }),
    transaction_count: rows.length,
  }
}

const NEEDS_CATEGORIES = new Set([
  'Housing',
  'Food & Dining',
  'Healthcare',
  'Transportation',
  'Education',
  'Family',
  'EMI',
])

/**
 * Net change in the investment perimeter: allocations in, minus redemptions out.
 *
 * Reuses the app's existing perimeter predicates rather than adding a fourth
 * definition of "is this an investment movement" -- the health panel already
 * decides it this way, and `isInvestmentAccount` is the shared name classifier.
 * Can be negative (a net-withdrawal window), which is a real outcome and is not
 * clamped, matching the endpoint's signed `bucket_totals["savings"]`.
 */
function netInvestmentPerimeterFlow(rows: readonly Transaction[]): number {
  let net = 0
  for (const t of rows) {
    if (checkIsInvestmentTransaction(t, isInvestmentAccount)) net += Math.abs(t.amount)
    else if (checkIsInvestmentWithdrawal(t, isInvestmentAccount)) net -= Math.abs(t.amount)
    // Income landing directly inside the perimeter (an EPF contribution, an RSU
    // vest) never crosses it as a Transfer, so the endpoint counts it here too.
    else if (isIncome(t) && isInvestmentAccount(t.account)) net += Math.abs(t.amount)
  }
  return net
}

/** 50/30/20 rule over the trailing window, computed from the demo ledger. */
export function generateDemoSpendingRule(
  txs: Transaction[],
  params: Record<string, unknown>,
): SpendingRuleResponse {
  let rows = txs
  if (params.start_date) rows = rows.filter((t) => t.date >= (params.start_date as string))
  if (params.end_date) rows = rows.filter((t) => t.date <= (params.end_date as string))

  const income = rows.filter(isIncome).reduce((s, t) => s + t.amount, 0)
  const expenses = rows.filter(isExpense)
  const expenseTotal = expenses.reduce((s, t) => s + t.amount, 0)
  // Savings is the NET CHANGE IN THE INVESTMENT PERIMETER, not income minus
  // expenses -- the distinction `/api/analytics/v2/spending-rule` is built
  // around (`_compute_buckets` in `analytics_v2_impl/spending_rule.py`) and that
  // BudgetPage's docstring states explicitly. This mock used `income -
  // expenseTotal`, which is the definition the endpoint REJECTS: it reports
  // money that merely stayed in a bank account as invested, and it makes the
  // residual identically zero, so demo mode could never show an Unallocated
  // figure at all.
  const savings = netInvestmentPerimeterFlow(rows)

  const byCategory = new Map<string, Transaction[]>()
  for (const t of expenses) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, [])
    byCategory.get(t.category)?.push(t)
  }

  const months = new Set(rows.map((t) => t.date.slice(0, 7))).size || 1
  let needs = 0
  let wants = 0
  const categories = [...byCategory.entries()].map(([category, list]) => {
    const total = list.reduce((s, t) => s + t.amount, 0)
    const bucket: SpendingBucket = NEEDS_CATEGORIES.has(category) ? 'needs' : 'wants'
    if (bucket === 'needs') needs += total
    else wants += total
    const subTotals = new Map<string, number>()
    for (const t of list) {
      const sub = t.subcategory ?? '(no subcategory)'
      subTotals.set(sub, (subTotals.get(sub) ?? 0) + t.amount)
    }
    return {
      category,
      subcategory: null,
      bucket,
      total_amount: total,
      avg_monthly: total / months,
      txn_count: list.length,
      months_seen: new Set(list.map((t) => t.date.slice(0, 7))).size,
      top_subs: [...subTotals.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3),
    }
  })

  // Income is the single denominator for all four buckets -- that is what makes
  // the four shares sum to exactly 100 (`_pct_of_income` in
  // `analytics_v2_impl/spending_rule.py`). Routed through the shared helper so
  // the zero-income branch is decided in one place; the endpoint's 0.0 fallback
  // is the one this mock has to reproduce.
  const pct = (x: number) => shareOfIncomePercent(x, income)
  // The residual: whatever income was neither spent nor moved into the
  // investment perimeter (money that simply stayed in a bank account). The
  // endpoint publishes it so the three buckets plus this add to income exactly;
  // omitting it here made demo mode's cards silently fail to reconcile.
  const unallocated = income - needs - wants - savings
  // No `rows.length ?` guard needed: spreading an empty array and sorting it
  // already yields [], and both readers below use optional chaining.
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  return {
    period: {
      // The populated branch yields a stored `YYYY-MM-DD` (local calendar), so
      // the empty-ledger fallback has to be the same shape. A UTC key here made
      // the two branches disagree by a day for any user east of Greenwich.
      start: sorted[0]?.date ?? toLocalDateKey(new Date()),
      end: sorted.at(-1)?.date ?? toLocalDateKey(new Date()),
      months,
    },
    income_total: income,
    expense_total: expenseTotal,
    savings_amount: savings,
    unallocated_amount: unallocated,
    unallocated_pct_of_income: pct(unallocated),
    targets: { needs: 50, wants: 30, savings: 20 },
    buckets: {
      needs: { amount: needs, pct_of_income: pct(needs), score_delta: 50 - pct(needs) },
      wants: { amount: wants, pct_of_income: pct(wants), score_delta: 30 - pct(wants) },
      savings: { amount: savings, pct_of_income: pct(savings), score_delta: pct(savings) - 20 },
    },
    // Spread-then-sort, not `toSorted` -- see the note in
    // `generateDemoMerchantIntelligence`: toSorted is firefox115+, past this
    // repo's firefox114 build target, and nothing polyfills it.
    categories: [...categories].sort((a, b) => b.total_amount - a.total_amount),
  }
}

/** Account-name -> classification map (Settings > Accounts equivalents). */
export function generateDemoAccountClassifications(): Record<string, string> {
  return {
    'SBI Savings': 'Bank Accounts',
    'HDFC Salary': 'Bank Accounts',
    'Axis Bank': 'Bank Accounts',
    'Swiggy HDFC Credit Card': 'Credit Cards',
    'Amazon Pay ICICI Credit Card': 'Credit Cards',
    'Flipkart Axis Credit Card': 'Credit Cards',
    'GPay UPI': 'Other Wallets',
    'Pluxee Wallet': 'Other Wallets',
    'Amazon Wallet': 'Other Wallets',
    'Groww Stocks': 'Investments',
    'Groww Mutual Funds': 'Investments',
    'EPF Account': 'Investments',
    'PPF Account': 'Investments',
    'SBI FD': 'Investments',
    'Friends Account': 'Loans/Lended',
    'Flat Shared Account': 'Loans/Lended',
    'Family Account': 'Loans/Lended',
    'Cashback Pool': 'Other Wallets',
    Cash: 'Cash',
    'Voucher Account': 'Other Wallets',
  }
}

/**
 * Accounts of one classification, matching `/account-classifications/type/{type}`.
 *
 * Derived from the map above rather than listed separately so the two can never
 * disagree. Needed as its own demo route because the endpoint returns a bare
 * `{ accounts: [...] }`, not the name -> classification map: callers such as the
 * SIP projection page do `accounts.includes(name)` on it, which throws on
 * `undefined` and takes the whole page to its error boundary.
 */
export function generateDemoAccountsByType(accountType: string): { accounts: string[] } {
  const classifications = generateDemoAccountClassifications()
  return {
    accounts: Object.entries(classifications)
      .filter(([, type]) => type === accountType)
      .map(([name]) => name),
  }
}

export function generateDemoSavedViews(): SavedView[] {
  const now = new Date().toISOString()
  return [
    {
      id: 1,
      name: 'Festival Spending',
      filters: { tag: 'festival', type: 'Expense' },
      created_at: now,
      updated_at: now,
    },
    {
      id: 2,
      name: 'Big Expenses (5k+)',
      filters: { type: 'Expense', min_amount: 5000 },
      created_at: now,
      updated_at: now,
    },
    {
      id: 3,
      name: 'Food on Credit Cards',
      filters: { category: 'Food & Dining', account: 'Swiggy HDFC Credit Card' },
      created_at: now,
      updated_at: now,
    },
  ]
}

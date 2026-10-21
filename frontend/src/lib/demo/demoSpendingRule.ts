import type { SpendingBucket, SpendingRuleResponse } from '@/services/api/analyticsV2'
import {
  checkIsInvestmentTransaction,
  checkIsInvestmentWithdrawal,
} from '@/components/analytics/health/healthScoreTypes'
import { isPartialMonth, monthKeysBetween, toLocalDateKey } from '@/lib/dateUtils'
import { investmentAccountTest } from '@/lib/finance/investmentFlows'
import { isEssentialExpense } from '@/lib/finance/metricRules'
import { shareOfIncomePercent } from '@/lib/savingsRate'
import type { Transaction } from '@/types'

import { ESSENTIAL_CATEGORIES, isExpense, isIncome } from './demoHelpers'
import { DEMO_INVESTMENT_MAPPINGS } from './demoPreferences'

/** The demo user's mapped accounts, as the endpoint reads `investment_account_mappings`. */
const isInvestmentAccount = investmentAccountTest(Object.keys(DEMO_INVESTMENT_MAPPINGS))

/**
 * The endpoint's Needs rule (`is_essential_expense`): the built-in keywords plus
 * the demo user's `essential_categories`, on the category OR the subcategory.
 */
const bucketOf = (t: Transaction): SpendingBucket =>
  isEssentialExpense(t.category, t.subcategory, ESSENTIAL_CATEGORIES) ? 'needs' : 'wants'

/**
 * Net change in the investment perimeter: allocations in, minus redemptions out.
 *
 * Reuses the app's existing perimeter predicates rather than adding a fourth
 * definition of "is this an investment movement" -- the health panel already
 * decides it this way, over the shared `investmentAccountTest` perimeter.
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

  // One row per (category, bucket), like the endpoint's `category_rows`: the
  // Needs rule reads the subcategory too, so one category can feed both buckets.
  const byCategory = new Map<string, { category: string; bucket: SpendingBucket; list: Transaction[] }>()
  for (const t of expenses) {
    const bucket = bucketOf(t)
    const key = `${bucket}:${t.category}`
    const group = byCategory.get(key) ?? { category: t.category, bucket, list: [] }
    group.list.push(t)
    byCategory.set(key, group)
  }

  // Averages use COMPLETE calendar months only, like the endpoint's
  // `_complete_months_between`: every month in the window counts (an empty one
  // is a zero month), the month still in progress does not, and a window
  // inside the current month has 0. Totals and shares still include it.
  const today = toLocalDateKey(new Date())
  const firstDate = rows.reduce<string | undefined>((min, t) => (min === undefined || t.date < min ? t.date : min), undefined)
  const windowStart = (params.start_date as string | undefined) ?? firstDate ?? today
  const windowEnd = (params.end_date as string | undefined) ?? today
  const inProgress = isPartialMonth(today.slice(0, 7)) ? today.slice(0, 7) : null
  const months = monthKeysBetween(windowStart, windowEnd).filter((m) => m !== inProgress).length
  let needs = 0
  let wants = 0
  const categories = [...byCategory.values()].map(({ category, bucket, list }) => {
    const total = list.reduce((s, t) => s + t.amount, 0)
    const completeTotal = list
      .filter((t) => t.date.slice(0, 7) !== inProgress)
      .reduce((s, t) => s + t.amount, 0)
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
      avg_monthly: months > 0 ? completeTotal / months : 0,
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

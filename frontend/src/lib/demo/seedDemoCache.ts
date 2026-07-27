import type { QueryClient } from '@tanstack/react-query'
import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import {
  accountBalancesOptions,
  masterCategoriesOptions,
  monthlyAggregationOptions,
  recentTransactionsOptions,
  totalsOptions,
  trendsOptions,
} from '@/hooks/api/useAnalytics'
import { generateDemoTransactions } from './generateTransactions'
import {
  generateDemoPreferences,
  generateDemoTotals,
  generateDemoMonthlyAggregation,
  generateDemoAccountBalances,
  generateDemoMasterCategories,
  generateDemoTrends,
  generateDemoBudgets,
  generateDemoGoals,
} from './generateDerivedData'

/** Module-level cache so transactions are not regenerated on every call */
let cachedTransactions: ReturnType<typeof generateDemoTransactions> | null = null

export function getDemoTransactions() {
  cachedTransactions ??= generateDemoTransactions()
  return cachedTransactions
}

/**
 * Seed the TanStack Query cache with demo data.
 *
 * Most routes -- including every analytics v2 endpoint and any param
 * combination of it -- are served by the DEMO_ROUTES table in
 * `services/api/client.ts`. A seed only exists here for a route the
 * interceptor cannot answer, or to skip the first-paint spinner on a key that
 * a component reads before navigation.
 *
 * Never hand-write a query key here. staleTime is Infinity, so a key that does
 * not match the reading hook's key element-for-element is written to a slot no
 * hook ever consults, and it drifts silently the moment the hook gains a param.
 * Build every key from the exported `*Options` factory the hook itself calls
 * (`queryOptions` from `hooks/api/useAnalytics`) or from `analyticsV2Keys.*`.
 * That is also why there is no seed for `category-breakdown`, `kpis`,
 * `analytics/overview` or `analytics/behavior`: the first is only ever read
 * with a `transaction_type` param (so the param-less slot is unreachable) and
 * the other three have no consumer left in the app at all.
 *
 * Enforced invariants live in `__tests__/seedDemoCache.test.tsx` (analyticsV2
 * key-factory contract) and `__tests__/seedReaderContract.test.tsx`, which
 * mounts a reader for EVERY seed -- `preferences` included -- and additionally
 * scans the app's source for every distinct way each seeded hook is invoked, so
 * a real call site gaining a param fails the build without the seed changing.
 */
export function seedDemoCache(qc: QueryClient): void {
  const txs = getDemoTransactions()
  const recentTxs = txs.slice(0, 5) // already sorted newest-first

  // Preferences -- no DEMO_ROUTES entry, so this seed is the only data source.
  qc.setQueryData(['preferences'], generateDemoPreferences())

  // Transactions. `useTransactions()` is called with no filters, so the key
  // carries an `undefined` params slot.
  qc.setQueryData(['transactions', undefined], txs)
  qc.setQueryData(recentTransactionsOptions(5).queryKey, recentTxs)

  // Calculations. Keys come from the same factories the hooks call, so a param
  // added to a factory can no longer leave the seed behind on a stale slot.
  qc.setQueryData(totalsOptions().queryKey, generateDemoTotals(txs))
  qc.setQueryData(monthlyAggregationOptions().queryKey, generateDemoMonthlyAggregation(txs))
  qc.setQueryData(accountBalancesOptions().queryKey, generateDemoAccountBalances(txs))
  // No DEMO_ROUTES entry either -- the seed is the only source.
  qc.setQueryData(masterCategoriesOptions().queryKey, generateDemoMasterCategories(txs))

  // Analytics V1 -- `useTrends('all_time')` is the one v1 endpoint still read.
  qc.setQueryData(trendsOptions('all_time').queryKey, generateDemoTrends(txs))

  // Analytics V2 -- only the two keys read before first paint: the budget badges
  // in the sidebar / mobile tab bar / notification center, and Overview, which
  // renders a skeleton until both settle. Every other v2 param combination is
  // served by DEMO_ROUTES.
  qc.setQueryData(analyticsV2Keys.budgets({ active_only: true }), generateDemoBudgets())
  qc.setQueryData(analyticsV2Keys.goals(), generateDemoGoals())
}

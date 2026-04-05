import type { QueryClient } from '@tanstack/react-query'
import { generateDemoTransactions } from './generateTransactions'
import {
  generateDemoPreferences,
  generateDemoTotals,
  generateDemoMonthlyAggregation,
  generateDemoAccountBalances,
  generateDemoMasterCategories,
  generateDemoCategoryBreakdown,
  generateDemoKPIs,
  generateDemoOverview,
  generateDemoBehavior,
  generateDemoTrends,
  generateDemoMonthlySummaries,
  generateDemoCategoryTrends,
  generateDemoRecurring,
  generateDemoNetWorth,
  generateDemoFYSummaries,
  generateDemoAnomalies,
  generateDemoBudgets,
  generateDemoGoals,
} from './generateDerivedData'

/** Module-level cache so transactions are not regenerated on every call */
let cachedTransactions: ReturnType<typeof generateDemoTransactions> | null = null

export function getDemoTransactions() {
  if (!cachedTransactions) cachedTransactions = generateDemoTransactions()
  return cachedTransactions
}

/**
 * Seed all TanStack Query cache keys with demo data.
 * After this, pages can render without any API calls.
 */
export function seedDemoCache(qc: QueryClient): void {
  const txs = getDemoTransactions()
  const recentTxs = txs.slice(0, 5) // already sorted newest-first

  // Preferences
  qc.setQueryData(['preferences'], generateDemoPreferences())

  // Transactions
  qc.setQueryData(['transactions', undefined], txs)
  qc.setQueryData(['transactions', 'recent', 5], recentTxs)

  // Calculations (undefined params = default, no date filter)
  qc.setQueryData(['calculations', 'totals', undefined], generateDemoTotals(txs))
  qc.setQueryData(['calculations', 'monthly-aggregation', undefined], generateDemoMonthlyAggregation(txs))
  qc.setQueryData(['calculations', 'account-balances', undefined], generateDemoAccountBalances(txs))
  qc.setQueryData(['calculations', 'master-categories'], generateDemoMasterCategories(txs))
  qc.setQueryData(['calculations', 'category-breakdown', undefined], generateDemoCategoryBreakdown(txs))

  // Analytics V1
  qc.setQueryData(['kpis', undefined], generateDemoKPIs(txs))
  qc.setQueryData(['analytics', 'overview', 'all_time'], generateDemoOverview(txs))
  qc.setQueryData(['analytics', 'behavior', 'all_time'], generateDemoBehavior(txs))
  qc.setQueryData(['analytics', 'trends', 'all_time'], generateDemoTrends(txs))

  // Analytics V2
  const recurring = generateDemoRecurring()
  qc.setQueryData(['analyticsV2', 'monthly-summaries'], generateDemoMonthlySummaries(txs))
  qc.setQueryData(['analyticsV2', 'category-trends', undefined, undefined], generateDemoCategoryTrends(txs))
  qc.setQueryData(['analyticsV2', 'recurring-transactions', undefined, undefined], recurring)
  qc.setQueryData(['analyticsV2', 'recurring-transactions', true, 0], recurring.filter((r) => r.is_active))
  qc.setQueryData(['analyticsV2', 'net-worth'], generateDemoNetWorth(txs))
  qc.setQueryData(['analyticsV2', 'fy-summaries'], generateDemoFYSummaries(txs))
  qc.setQueryData(['analyticsV2', 'anomalies', undefined, undefined, undefined], generateDemoAnomalies())
  qc.setQueryData(['analyticsV2', 'anomalies', undefined, undefined, false], generateDemoAnomalies().filter((a) => !a.is_reviewed))
  qc.setQueryData(['analyticsV2', 'budgets', undefined], generateDemoBudgets())
  qc.setQueryData(['analyticsV2', 'budgets', true], generateDemoBudgets())
  qc.setQueryData(['analyticsV2', 'goals', undefined, undefined], generateDemoGoals())
  qc.setQueryData(['analyticsV2', 'transfer-flows'], [])
  qc.setQueryData(['analyticsV2', 'merchant-intelligence', undefined, undefined], [])
}

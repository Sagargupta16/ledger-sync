/**
 * Query keys for the analytics v2 hooks, and the param shape each service
 * method accepts. Re-exported from useAnalyticsV2.
 */

import { getCurrentMonth } from '@/lib/dateUtils'
import type { analyticsV2Service } from '@/services/api/analyticsV2'

/**
 * The param object a service method accepts, read off the method itself.
 *
 * The key factory and the hooks used to re-declare each param shape by hand,
 * independently of the service. They drifted: 12 params were advertised here
 * that the service does not send, because the corresponding FastAPI handlers
 * never declared them (`offset` on seven endpoints, `subcategory` on
 * category-trends, `limit` on transfer-flows and fy-summaries). Deriving the
 * shape means a param name that the service cannot accept is now a compile
 * error at the point it is written, instead of a silent cache-splitting param
 * that is dropped before the request goes out.
 *
 * Only for methods that take a param object -- `Parameters<() => T>[0]` on a
 * zero-arg method is a tuple out-of-range error, so those stay zero-arg here too.
 */
export type ServiceParams<K extends keyof typeof analyticsV2Service> = Parameters<
  (typeof analyticsV2Service)[K]
>[0]

// Query keys -- filter properties spread directly to avoid object reference mismatches.
// EVERY param the queryFn sends must appear in the key: staleTime is Infinity,
// so a param missing from the key means two callers with different values
// silently share one cache entry (first mount wins). The converse also matters
// and is what `ServiceParams` above enforces: a key position for a param the
// request never carries splits the cache on a value the server cannot see, so
// two callers refetch identical data under different keys.
export const analyticsV2Keys = {
  all: ['analyticsV2'] as const,
  dailySummaries: (filters?: ServiceParams<'getDailySummaries'>) =>
    [...analyticsV2Keys.all, 'daily-summaries', filters?.start_date, filters?.end_date, filters?.limit] as const,
  cohortSpending: () => [...analyticsV2Keys.all, 'cohort-spending'] as const,
  investmentHoldings: (filters?: ServiceParams<'getInvestmentHoldings'>) =>
    [...analyticsV2Keys.all, 'investment-holdings', filters?.active_only] as const,
  monthlySummaries: (filters?: ServiceParams<'getMonthlySummaries'>) =>
    [...analyticsV2Keys.all, 'monthly-summaries', filters?.limit] as const,
  categoryTrends: (filters?: ServiceParams<'getCategoryTrends'>) =>
    [...analyticsV2Keys.all, 'category-trends', filters?.category, filters?.limit] as const,
  // No params at all: the handler returns every flow, so there is exactly one
  // cache entry for it.
  transferFlows: () => [...analyticsV2Keys.all, 'transfer-flows'] as const,
  recurringTransactions: (filters?: ServiceParams<'getRecurringTransactions'>) =>
    [...analyticsV2Keys.all, 'recurring-transactions', filters?.active_only, filters?.min_confidence, filters?.pattern_kind] as const,
  merchantIntelligence: (filters?: ServiceParams<'getMerchantIntelligence'>) =>
    [...analyticsV2Keys.all, 'merchant-intelligence', filters?.min_transactions, filters?.recurring_only, filters?.limit] as const,
  netWorth: (filters?: ServiceParams<'getNetWorthSnapshots'>) =>
    [...analyticsV2Keys.all, 'net-worth', filters?.limit] as const,
  // Also param-free: the handler returns every fiscal year.
  fySummaries: () => [...analyticsV2Keys.all, 'fy-summaries'] as const,
  anomalies: (filters?: ServiceParams<'getAnomalies'>) =>
    [...analyticsV2Keys.all, 'anomalies', filters?.type, filters?.severity, filters?.include_reviewed, filters?.limit] as const,
  // Under the `anomalies` prefix so a review invalidates the totals with the rows.
  anomalyCounts: (filters?: ServiceParams<'getAnomalyCounts'>) =>
    [...analyticsV2Keys.anomalies(filters), 'counts'] as const,
  // Usage is for the current ledger month, which the server picks, so the month
  // is part of the key: last month's entry must not answer after the rollover.
  budgets: (filters?: ServiceParams<'getBudgets'>) =>
    [...analyticsV2Keys.all, 'budgets', filters?.active_only, getCurrentMonth()] as const,
  // The handler defaults include_achieved to true, so an omitted value and an
  // explicit true are the same request and share one cache entry.
  goals: (filters?: ServiceParams<'getGoals'>) =>
    [...analyticsV2Keys.all, 'goals', filters?.goal_type, filters?.include_achieved ?? true] as const,
  spendingRule: (filters?: ServiceParams<'getSpendingRule'>) =>
    [...analyticsV2Keys.all, 'spending-rule', filters?.start_date, filters?.end_date] as const,
}

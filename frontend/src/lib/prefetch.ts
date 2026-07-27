/**
 * Core Data Prefetcher
 *
 * Preloads all frequently-needed data into the TanStack Query cache
 * right after login, so page navigations render instantly with no
 * loading spinners.
 *
 * Data only changes on explicit user actions (upload, settings save),
 * and those mutations already invalidate the relevant query keys.
 */

import { queryClient } from './queryClient'
import { transactionsService } from '@/services/api/transactions'
import { preferencesService } from '@/services/api/preferences'
import { analyticsService } from '@/services/api/analytics'
import { calculationsApi } from '@/services/api/calculations'
import { analyticsV2Service } from '@/services/api/analyticsV2'
import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'

/**
 * Prefetch all core data that pages need.
 * Called once after login -- all fetches run in parallel.
 *
 * Every call is `void`-marked deliberately. `prefetchQuery` resolves rather than
 * rejects on failure (TanStack swallows the error and leaves the cache slot
 * empty, so the page fetches normally on arrival), and nothing here is awaited
 * because the point is to warm the cache without blocking. The `void` makes that
 * intent explicit instead of leaving 10 unhandled promises for a reader -- or the
 * type-checked lint tier -- to judge.
 */
export function prefetchCoreData() {
  // Preferences — used by virtually every page
  void queryClient.prefetchQuery({
    queryKey: ['preferences'],
    queryFn: () => preferencesService.getPreferences(),
  })

  // All transactions — used by Dashboard, Spending, Income, Budget, YearInReview, etc.
  void queryClient.prefetchQuery({
    queryKey: ['transactions', undefined],
    queryFn: () => transactionsService.getTransactions(),
  })

  // Recent transactions — Dashboard widget
  void queryClient.prefetchQuery({
    queryKey: ['transactions', 'recent', 5],
    queryFn: () => analyticsService.getRecentTransactions(5),
  })

  // Account balances — Dashboard, NetWorth, Settings
  void queryClient.prefetchQuery({
    queryKey: ['calculations', 'account-balances', undefined],
    queryFn: async () => {
      const response = await calculationsApi.getAccountBalances()
      return response.data
    },
  })

  // Master categories — Settings, SpendingAnalysis filters
  void queryClient.prefetchQuery({
    queryKey: ['calculations', 'master-categories'],
    queryFn: async () => {
      const response = await calculationsApi.getMasterCategories()
      return response.data
    },
  })

  // KPIs — Dashboard
  void queryClient.prefetchQuery({
    queryKey: ['kpis', undefined],
    queryFn: () => analyticsService.getKPIs(),
  })

  // Analytics v2 keys MUST come from `analyticsV2Keys`, never a literal: staleTime
  // is Infinity, so a key that misses a factory param warms a slot no hook reads
  // and the page still spins after paying for the round-trip.

  // Monthly summaries — used by multiple analytics pages
  void queryClient.prefetchQuery({
    queryKey: analyticsV2Keys.monthlySummaries(),
    queryFn: () => analyticsV2Service.getMonthlySummaries(),
  })

  // Category trends — used by spending/analytics pages
  void queryClient.prefetchQuery({
    queryKey: analyticsV2Keys.categoryTrends(),
    queryFn: () => analyticsV2Service.getCategoryTrends(),
  })

  // Daily summaries — YearInReview heatmap
  void queryClient.prefetchQuery({
    queryKey: analyticsV2Keys.dailySummaries(),
    queryFn: () => analyticsV2Service.getDailySummaries(),
  })

  // Investment holdings — InvestmentAnalytics page
  void queryClient.prefetchQuery({
    queryKey: analyticsV2Keys.investmentHoldings(),
    queryFn: () => analyticsV2Service.getInvestmentHoldings(),
  })
}

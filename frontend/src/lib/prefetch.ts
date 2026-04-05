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

/**
 * Prefetch all core data that pages need.
 * Called once after login — all fetches run in parallel.
 */
export function prefetchCoreData() {
  // Preferences — used by virtually every page
  queryClient.prefetchQuery({
    queryKey: ['preferences'],
    queryFn: () => preferencesService.getPreferences(),
  })

  // All transactions — used by Dashboard, Spending, Income, Budget, YearInReview, etc.
  queryClient.prefetchQuery({
    queryKey: ['transactions', undefined],
    queryFn: () => transactionsService.getTransactions(),
  })

  // Recent transactions — Dashboard widget
  queryClient.prefetchQuery({
    queryKey: ['transactions', 'recent', 5],
    queryFn: () => analyticsService.getRecentTransactions(5),
  })

  // Account balances — Dashboard, NetWorth, Settings
  queryClient.prefetchQuery({
    queryKey: ['calculations', 'account-balances', undefined],
    queryFn: async () => {
      const response = await calculationsApi.getAccountBalances()
      return response.data
    },
  })

  // Master categories — Settings, SpendingAnalysis filters
  queryClient.prefetchQuery({
    queryKey: ['calculations', 'master-categories'],
    queryFn: async () => {
      const response = await calculationsApi.getMasterCategories()
      return response.data
    },
  })

  // KPIs — Dashboard
  queryClient.prefetchQuery({
    queryKey: ['kpis', undefined],
    queryFn: () => analyticsService.getKPIs(),
  })

  // Monthly summaries — used by multiple analytics pages
  queryClient.prefetchQuery({
    queryKey: ['analyticsV2', 'monthly-summaries'],
    queryFn: () => analyticsV2Service.getMonthlySummaries(),
  })

  // Category trends — used by spending/analytics pages
  queryClient.prefetchQuery({
    queryKey: ['analyticsV2', 'category-trends', undefined],
    queryFn: () => analyticsV2Service.getCategoryTrends(),
  })

  // Daily summaries — YearInReview heatmap
  queryClient.prefetchQuery({
    queryKey: ['analyticsV2', 'daily-summaries'],
    queryFn: () => analyticsV2Service.getDailySummaries(),
  })

  // Investment holdings — InvestmentAnalytics page
  queryClient.prefetchQuery({
    queryKey: ['analyticsV2', 'investment-holdings', undefined],
    queryFn: () => analyticsV2Service.getInvestmentHoldings(),
  })
}

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

  // Transfer flows — IncomeExpenseFlow page
  queryClient.prefetchQuery({
    queryKey: ['analyticsV2', 'transfer-flows'],
    queryFn: () => analyticsV2Service.getTransferFlows(),
  })

  // Recurring transactions — BillCalendar, SubscriptionTracker
  queryClient.prefetchQuery({
    queryKey: ['analyticsV2', 'recurring-transactions', undefined, undefined],
    queryFn: () => analyticsV2Service.getRecurringTransactions(),
  })

  // Merchant intelligence — SpendingAnalysis (TopMerchants)
  queryClient.prefetchQuery({
    queryKey: ['analyticsV2', 'merchant-intelligence', undefined, undefined],
    queryFn: () => analyticsV2Service.getMerchantIntelligence(),
  })

  // Net worth snapshots — NetWorth page
  queryClient.prefetchQuery({
    queryKey: ['analyticsV2', 'net-worth'],
    queryFn: () => analyticsV2Service.getNetWorthSnapshots(),
  })

  // FY summaries — TaxPlanning, YearInReview
  queryClient.prefetchQuery({
    queryKey: ['analyticsV2', 'fy-summaries'],
    queryFn: () => analyticsV2Service.getFYSummaries(),
  })

  // Anomalies — AnomalyReview page
  queryClient.prefetchQuery({
    queryKey: ['analyticsV2', 'anomalies', undefined, undefined, undefined],
    queryFn: () => analyticsV2Service.getAnomalies(),
  })

  // Budgets — BudgetPage
  queryClient.prefetchQuery({
    queryKey: ['analyticsV2', 'budgets', undefined],
    queryFn: () => analyticsV2Service.getBudgets(),
  })

  // Goals — GoalsPage
  queryClient.prefetchQuery({
    queryKey: ['analyticsV2', 'goals', undefined, undefined],
    queryFn: () => analyticsV2Service.getGoals(),
  })

  // Totals — Dashboard, SpendingAnalysis
  queryClient.prefetchQuery({
    queryKey: ['calculations', 'totals', undefined],
    queryFn: async () => {
      const response = await calculationsApi.getTotals()
      return response.data
    },
  })
}

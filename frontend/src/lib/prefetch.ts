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
import { dataHealthKeys } from '@/hooks/api/useDataHealthQuery'

/**
 * Params below are COPIED from their call sites, not invented.
 *
 * Every key factory in `analyticsV2Keys` folds its filter values into the key,
 * and `staleTime` is Infinity, so a prefetch whose params differ by one field
 * warms a slot no hook ever reads: the round-trip is paid for AND the page still
 * spins. These constants exist so the pairing is visible in one place; if a call
 * site changes its filters, the matching entry here has to change with it.
 */
const RECURRING_COMMITMENTS_ACTIVE = { active_only: true, pattern_kind: 'commitment' } as const
/** Dashboard passes `min_confidence: 0` explicitly, which is a DIFFERENT key. */
const RECURRING_DASHBOARD = {
  active_only: true,
  min_confidence: 0,
  pattern_kind: 'commitment',
} as const
/** Recurring page shows inactive rows too. */
const RECURRING_ALL = { active_only: false, min_confidence: 0 } as const
/** Mirrors MIN_TRANSACTIONS / ROW_LIMIT in useMerchantIntel and TopMerchants. */
const MERCHANTS = { min_transactions: 2, limit: 200 } as const

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

  // Recurring commitments -- the chrome fetches these on EVERY page (sidebar
  // badge, mobile tab bar, notification bell), so warming them removes a
  // round-trip from the first paint of the whole workspace, not just one route.
  void queryClient.prefetchQuery({
    queryKey: analyticsV2Keys.recurringTransactions(RECURRING_COMMITMENTS_ACTIVE),
    queryFn: () => analyticsV2Service.getRecurringTransactions(RECURRING_COMMITMENTS_ACTIVE),
  })

  // Dashboard's Fixed Commitments widget -- same endpoint, different key.
  void queryClient.prefetchQuery({
    queryKey: analyticsV2Keys.recurringTransactions(RECURRING_DASHBOARD),
    queryFn: () => analyticsV2Service.getRecurringTransactions(RECURRING_DASHBOARD),
  })

  // Recurring page -- includes inactive rows.
  void queryClient.prefetchQuery({
    queryKey: analyticsV2Keys.recurringTransactions(RECURRING_ALL),
    queryFn: () => analyticsV2Service.getRecurringTransactions(RECURRING_ALL),
  })

  // Data health -- StaleAnalyticsAlert renders it in the global layout, so this
  // one is also workspace-wide rather than page-local.
  void queryClient.prefetchQuery({
    queryKey: dataHealthKeys.summary(),
    queryFn: () => analyticsV2Service.getDataHealth(),
  })

  // Merchants -- Merchants page and the Dashboard's TopMerchants card.
  void queryClient.prefetchQuery({
    queryKey: analyticsV2Keys.merchantIntelligence(MERCHANTS),
    queryFn: () => analyticsV2Service.getMerchantIntelligence(MERCHANTS),
  })

  // Goals -- Overview reads the default view, the Goals page includes achieved.
  void queryClient.prefetchQuery({
    queryKey: analyticsV2Keys.goals(),
    queryFn: () => analyticsV2Service.getGoals(),
  })
  void queryClient.prefetchQuery({
    queryKey: analyticsV2Keys.goals({ include_achieved: true }),
    queryFn: () => analyticsV2Service.getGoals({ include_achieved: true }),
  })

  // Net-worth snapshots -- Net Worth page.
  void queryClient.prefetchQuery({
    queryKey: analyticsV2Keys.netWorth(),
    queryFn: () => analyticsV2Service.getNetWorthSnapshots(),
  })

  // Deliberately NOT prefetched: `spendingRule` (Budget page). Its key folds in
  // a start/end date derived from the user's period picker and the ledger's own
  // min/max dates, so there is no single correct range to warm -- a guess would
  // fetch a range nothing reads. Same reasoning for the per-FY tax and
  // category-history queries, which key on a user selection made after arrival.
}

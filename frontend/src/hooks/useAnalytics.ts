/**
 * Re-export all analytics hooks from the consolidated location
 * This file is kept for backwards compatibility
 */
export {
  useKPIs,
  useRecentTransactions,
  useOverview,
  useBehavior,
  useTrends,
  useAccountDistribution,
  useCategoriesChart,
  useMonthlyTrends,
  useCategoryBreakdown,
  useAccountBalances,
  useMonthlyAggregation,
  useTotals,
  useGeneratedInsights,
} from './api/useAnalytics'

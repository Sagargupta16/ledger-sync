/**
 * Analytics V2 React Query Hooks
 *
 * Provides React Query hooks for all analytics v2 endpoints with proper
 * caching, invalidation, and optimistic updates.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { analyticsV2Service } from '@/services/api/analyticsV2'

// Data only changes on upload. Keep cached indefinitely for instant navigations.
const STABLE_STALE_TIME = Infinity
import type {
  Anomaly,
  Budget,
  CategoryTrend,
  CohortSpendingData,
  DailySummary,
  FinancialGoal,
  FYSummary,
  InvestmentHolding,
  MerchantIntelligence,
  MonthlySummary,
  NetWorthSnapshot,
  RecurringTransaction,
  SpendingRuleResponse,
  TransferFlow,
} from '@/services/api/analyticsV2'

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
type ServiceParams<K extends keyof typeof analyticsV2Service> = Parameters<
  (typeof analyticsV2Service)[K]
>[0]

// Query keys — filter properties spread directly to avoid object reference mismatches.
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
  budgets: (filters?: ServiceParams<'getBudgets'>) =>
    [...analyticsV2Keys.all, 'budgets', filters?.active_only] as const,
  goals: (filters?: ServiceParams<'getGoals'>) =>
    [...analyticsV2Keys.all, 'goals', filters?.goal_type, filters?.include_achieved] as const,
  spendingRule: (filters?: ServiceParams<'getSpendingRule'>) =>
    [...analyticsV2Keys.all, 'spending-rule', filters?.start_date, filters?.end_date] as const,
}

// Daily Summaries
export function useDailySummaries(params?: ServiceParams<'getDailySummaries'>) {
  return useQuery<DailySummary[], Error>({
    queryKey: analyticsV2Keys.dailySummaries(params),
    queryFn: () => analyticsV2Service.getDailySummaries(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Cohort Spending (day-of-week / day-of-month / month-of-year averages)
export function useCohortSpending() {
  return useQuery<CohortSpendingData, Error>({
    queryKey: analyticsV2Keys.cohortSpending(),
    queryFn: () => analyticsV2Service.getCohortSpending(),
    staleTime: STABLE_STALE_TIME,
  })
}

// Investment Holdings
export function useInvestmentHoldings(params?: ServiceParams<'getInvestmentHoldings'>) {
  return useQuery<InvestmentHolding[], Error>({
    queryKey: analyticsV2Keys.investmentHoldings(params),
    queryFn: () => analyticsV2Service.getInvestmentHoldings(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Monthly Summaries
export function useMonthlySummaries(params?: ServiceParams<'getMonthlySummaries'>) {
  return useQuery<MonthlySummary[], Error>({
    queryKey: analyticsV2Keys.monthlySummaries(params),
    queryFn: () => analyticsV2Service.getMonthlySummaries(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Category Trends
export function useCategoryTrends(params?: ServiceParams<'getCategoryTrends'>) {
  return useQuery<CategoryTrend[], Error>({
    queryKey: analyticsV2Keys.categoryTrends(params),
    queryFn: () => analyticsV2Service.getCategoryTrends(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Transfer Flows
export function useTransferFlows() {
  return useQuery<TransferFlow[], Error>({
    queryKey: analyticsV2Keys.transferFlows(),
    queryFn: () => analyticsV2Service.getTransferFlows(),
    staleTime: STABLE_STALE_TIME,
  })
}

// Recurring Transactions
/** `pattern_kind`: 'commitment' for bill/fixed-cost surfaces, 'habit' for discretionary repeats. */
export function useRecurringTransactions(params?: ServiceParams<'getRecurringTransactions'>) {
  return useQuery<RecurringTransaction[], Error>({
    queryKey: analyticsV2Keys.recurringTransactions(params),
    queryFn: () => analyticsV2Service.getRecurringTransactions(params),
    staleTime: STABLE_STALE_TIME,
  })
}

export interface RecurringTransactionPatch {
  id: number
  pattern_name?: string
  frequency?: string
  expected_amount?: number
  is_confirmed?: boolean
  is_active?: boolean
  pattern_kind?: string
}

export function useUpdateRecurringTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: RecurringTransactionPatch) =>
      analyticsV2Service.updateRecurringTransaction(id, body),
    onSuccess: () => {
      // `void`: every `invalidateQueries` in this file is fire-and-forget, the
      // same convention as useAuth / usePreferences / useAccountStatus. It never
      // rejects (query-core swallows refetch errors unless throwOnError is set),
      // and the mutation's own failure is toasted by the global MutationCache.
      void queryClient.invalidateQueries({ queryKey: analyticsV2Keys.all })
    },
  })
}

export function useCreateRecurringTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      name: string
      type: string
      frequency: string
      amount: number
      category?: string
      expected_day?: number
    }) => analyticsV2Service.createRecurringTransaction(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: analyticsV2Keys.all })
    },
  })
}

export function useDeleteRecurringTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => analyticsV2Service.deleteRecurringTransaction(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: analyticsV2Keys.all })
    },
  })
}

// Merchant Intelligence
export function useMerchantIntelligence(params?: ServiceParams<'getMerchantIntelligence'>) {
  return useQuery<MerchantIntelligence[], Error>({
    queryKey: analyticsV2Keys.merchantIntelligence(params),
    queryFn: () => analyticsV2Service.getMerchantIntelligence(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Net Worth Snapshots
export function useNetWorthSnapshots(params?: ServiceParams<'getNetWorthSnapshots'>) {
  return useQuery<NetWorthSnapshot[], Error>({
    queryKey: analyticsV2Keys.netWorth(params),
    queryFn: () => analyticsV2Service.getNetWorthSnapshots(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Fiscal Year Summaries
export function useFYSummaries() {
  return useQuery<FYSummary[], Error>({
    queryKey: analyticsV2Keys.fySummaries(),
    queryFn: () => analyticsV2Service.getFYSummaries(),
    staleTime: STABLE_STALE_TIME,
  })
}

// Anomalies
export function useAnomalies(params?: ServiceParams<'getAnomalies'>) {
  return useQuery<Anomaly[], Error>({
    queryKey: analyticsV2Keys.anomalies(params),
    queryFn: () => analyticsV2Service.getAnomalies(params),
    staleTime: STABLE_STALE_TIME,
  })
}

export function useReviewAnomaly() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ anomalyId, data }: { anomalyId: number; data: { dismiss: boolean; notes?: string } }) =>
      analyticsV2Service.reviewAnomaly(anomalyId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...analyticsV2Keys.all, 'anomalies'] })
    },
  })
}

// Budgets
export function useBudgets(params?: ServiceParams<'getBudgets'>) {
  return useQuery<Budget[], Error>({
    queryKey: analyticsV2Keys.budgets(params),
    queryFn: () => analyticsV2Service.getBudgets(params),
    staleTime: STABLE_STALE_TIME,
  })
}

export function useCreateBudget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      category: string
      subcategory?: string
      monthly_limit: number
      alert_threshold?: number
    }) => analyticsV2Service.createBudget(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...analyticsV2Keys.all, 'budgets'] })
    },
  })
}

// Goals
export function useGoals(params?: ServiceParams<'getGoals'>) {
  return useQuery<FinancialGoal[], Error>({
    queryKey: analyticsV2Keys.goals(params),
    queryFn: () => analyticsV2Service.getGoals(params),
    staleTime: STABLE_STALE_TIME,
  })
}

export function useCreateGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      goal_type: string
      target_amount: number
      target_date: string
      notes?: string
    }) => analyticsV2Service.createGoal(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...analyticsV2Keys.all, 'goals'] })
    },
  })
}

// 50/30/20 spending-rule aggregation. Cached per date-range params. Unlike
// the other v2 endpoints, this one is a live query rather than a rollup read,
// so it re-runs against current preferences -- fine because it's cheap and
// runs only when the user visits /budgets.
export function useSpendingRule(params?: ServiceParams<'getSpendingRule'>) {
  return useQuery<SpendingRuleResponse, Error>({
    queryKey: analyticsV2Keys.spendingRule(params),
    queryFn: () => analyticsV2Service.getSpendingRule(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Re-export types for convenience
export type {
  Anomaly,
  Budget,
  CategoryTrend,
  DailySummary,
  FinancialGoal,
  FYSummary,
  InvestmentHolding,
  MerchantIntelligence,
  MonthlySummary,
  NetWorthSnapshot,
  RecurringTransaction,
  SpendingRuleBucket,
  SpendingRuleCategoryRow,
  SpendingRuleResponse,
  TransferFlow,
} from '@/services/api/analyticsV2'

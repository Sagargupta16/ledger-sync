/**
 * Analytics V2 React Query Hooks
 *
 * Provides React Query hooks for all analytics v2 endpoints with proper
 * caching, invalidation, and optimistic updates.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { analyticsV2Service } from '@/services/api/analyticsV2'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { analyticsV2Keys, type ServiceParams } from '@/hooks/api/analyticsV2Keys'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'

// Data only changes on upload. Keep cached indefinitely for instant navigations.
const STABLE_STALE_TIME = Infinity
import type {
  Anomaly,
  AnomalyCounts,
  Budget,
  CohortSpendingData,
  CreateGoalRequest,
  DailySummary,
  FinancialGoal,
  MerchantIntelligence,
  MonthlySummary,
  SpendingRuleResponse,
  UpdateGoalRequest,
} from '@/services/api/analyticsV2'

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

// Monthly Summaries
export function useMonthlySummaries(params?: ServiceParams<'getMonthlySummaries'>) {
  return useQuery<MonthlySummary[], Error>({
    queryKey: analyticsV2Keys.monthlySummaries(params),
    queryFn: () => analyticsV2Service.getMonthlySummaries(params),
    staleTime: STABLE_STALE_TIME,
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

// Anomalies
export function useAnomalies(params?: ServiceParams<'getAnomalies'>) {
  return useQuery<Anomaly[], Error>({
    queryKey: analyticsV2Keys.anomalies(params),
    queryFn: () => analyticsV2Service.getAnomalies(params),
    staleTime: STABLE_STALE_TIME,
    // A filter change keeps the previous list on screen until the new one
    // resolves, so Anomaly Review's pinned filters are not swapped for its
    // loading skeleton (which also dropped the scroll position).
    placeholderData: keepPreviousData,
  })
}

/** Match totals for badges and summary tiles; the row list is capped by `limit`. */
export function useAnomalyCounts(params?: ServiceParams<'getAnomalyCounts'>) {
  return useQuery<AnomalyCounts, Error>({
    queryKey: analyticsV2Keys.anomalyCounts(params),
    queryFn: () => analyticsV2Service.getAnomalyCounts(params),
    staleTime: STABLE_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}

export function useReviewAnomaly() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...analyticsV2Keys.all, 'anomalies', 'review', getSessionGeneration()],
    mutationFn: ({ anomalyId, data }: { anomalyId: number; data: { dismiss: boolean; notes?: string } }) => {
      assertCurrentSession(sessionSignal)
      return analyticsV2Service.reviewAnomaly(anomalyId, data)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
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
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...analyticsV2Keys.all, 'budgets', 'create', getSessionGeneration()],
    mutationFn: (data: {
      category: string
      subcategory?: string
      monthly_limit: number
      alert_threshold?: number
    }) => {
      assertCurrentSession(sessionSignal)
      return analyticsV2Service.createBudget(data)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      void queryClient.invalidateQueries({ queryKey: [...analyticsV2Keys.all, 'budgets'] })
    },
  })
}

// Goals
export function useGoals(params?: ServiceParams<'getGoals'>) {
  const userId = useAuthStore((state) => state.user?.id)
  const isDemoMode = useDemoStore((state) => state.isDemoMode)

  return useQuery<FinancialGoal[], Error>({
    queryKey: [...analyticsV2Keys.goals(params), isDemoMode ? 'demo' : userId],
    queryFn: () => analyticsV2Service.getGoals(params),
    staleTime: STABLE_STALE_TIME,
    enabled: isDemoMode || userId != null,
  })
}

export function useCreateGoal() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...analyticsV2Keys.all, 'goals', 'create', getSessionGeneration()],
    mutationFn: (data: CreateGoalRequest) => {
      assertCurrentSession(sessionSignal)
      return analyticsV2Service.createGoal(data)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      return queryClient.invalidateQueries({ queryKey: [...analyticsV2Keys.all, 'goals'] })
    },
  })
}

export function useUpdateGoal() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...analyticsV2Keys.all, 'goals', 'update', getSessionGeneration()],
    mutationFn: ({ goalId, data }: { goalId: number; data: UpdateGoalRequest }) => {
      assertCurrentSession(sessionSignal)
      return analyticsV2Service.updateGoal(goalId, data)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      return queryClient.invalidateQueries({ queryKey: [...analyticsV2Keys.all, 'goals'] })
    },
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...analyticsV2Keys.all, 'goals', 'delete', getSessionGeneration()],
    mutationFn: (goalId: number) => {
      assertCurrentSession(sessionSignal)
      return analyticsV2Service.deleteGoal(goalId)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      return queryClient.invalidateQueries({ queryKey: [...analyticsV2Keys.all, 'goals'] })
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
    // One response per period, so the previous period stays a consistent
    // snapshot while the next loads; swapping to the skeleton instead
    // collapsed /budgets and threw a scrolled-down reader back to the top.
    placeholderData: keepPreviousData,
  })
}

export { analyticsV2Keys }
export {
  useCreateRecurringTransaction,
  useDeleteRecurringTransaction,
  useRecurringTransactions,
  useUpdateRecurringTransaction,
  type RecurringTransactionPatch,
} from '@/hooks/api/useAnalyticsV2Recurring'

// Re-export types for convenience
export type {
  Anomaly,
  Budget,
  FinancialGoal,
  MerchantIntelligence,
  RecurringTransaction,
} from '@/services/api/analyticsV2'

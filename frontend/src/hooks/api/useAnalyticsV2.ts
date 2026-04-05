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
  DailySummary,
  FinancialGoal,
  FYSummary,
  InvestmentHolding,
  MerchantIntelligence,
  MonthlySummary,
  NetWorthSnapshot,
  RecurringTransaction,
  TransferFlow,
} from '@/services/api/analyticsV2'

// Query keys — filter properties spread directly to avoid object reference mismatches
export const analyticsV2Keys = {
  all: ['analyticsV2'] as const,
  dailySummaries: (filters?: { start_date?: string; end_date?: string; limit?: number }) =>
    [...analyticsV2Keys.all, 'daily-summaries', filters?.start_date, filters?.end_date, filters?.limit] as const,
  investmentHoldings: (filters?: { active_only?: boolean }) =>
    [...analyticsV2Keys.all, 'investment-holdings', filters?.active_only] as const,
  monthlySummaries: () => [...analyticsV2Keys.all, 'monthly-summaries'] as const,
  categoryTrends: (filters?: { category?: string; subcategory?: string }) =>
    [...analyticsV2Keys.all, 'category-trends', filters?.category, filters?.subcategory] as const,
  transferFlows: () => [...analyticsV2Keys.all, 'transfer-flows'] as const,
  recurringTransactions: (filters?: { active_only?: boolean; min_confidence?: number }) =>
    [...analyticsV2Keys.all, 'recurring-transactions', filters?.active_only, filters?.min_confidence] as const,
  merchantIntelligence: (filters?: { min_transactions?: number; recurring_only?: boolean }) =>
    [...analyticsV2Keys.all, 'merchant-intelligence', filters?.min_transactions, filters?.recurring_only] as const,
  netWorth: () => [...analyticsV2Keys.all, 'net-worth'] as const,
  fySummaries: () => [...analyticsV2Keys.all, 'fy-summaries'] as const,
  anomalies: (filters?: { type?: string; severity?: string; include_reviewed?: boolean }) =>
    [...analyticsV2Keys.all, 'anomalies', filters?.type, filters?.severity, filters?.include_reviewed] as const,
  budgets: (filters?: { active_only?: boolean }) =>
    [...analyticsV2Keys.all, 'budgets', filters?.active_only] as const,
  goals: (filters?: { goal_type?: string; include_achieved?: boolean }) =>
    [...analyticsV2Keys.all, 'goals', filters?.goal_type, filters?.include_achieved] as const,
}

// Daily Summaries
export function useDailySummaries(params?: { start_date?: string; end_date?: string; limit?: number }) {
  return useQuery<DailySummary[], Error>({
    queryKey: analyticsV2Keys.dailySummaries(params),
    queryFn: () => analyticsV2Service.getDailySummaries(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Investment Holdings
export function useInvestmentHoldings(params?: { active_only?: boolean }) {
  return useQuery<InvestmentHolding[], Error>({
    queryKey: analyticsV2Keys.investmentHoldings(params),
    queryFn: () => analyticsV2Service.getInvestmentHoldings(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Monthly Summaries
export function useMonthlySummaries(params?: { limit?: number; offset?: number }) {
  return useQuery<MonthlySummary[], Error>({
    queryKey: analyticsV2Keys.monthlySummaries(),
    queryFn: () => analyticsV2Service.getMonthlySummaries(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Category Trends
export function useCategoryTrends(params?: {
  category?: string
  subcategory?: string
  limit?: number
  offset?: number
}) {
  return useQuery<CategoryTrend[], Error>({
    queryKey: analyticsV2Keys.categoryTrends({ category: params?.category, subcategory: params?.subcategory }),
    queryFn: () => analyticsV2Service.getCategoryTrends(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Transfer Flows
export function useTransferFlows(params?: { limit?: number; offset?: number }) {
  return useQuery<TransferFlow[], Error>({
    queryKey: analyticsV2Keys.transferFlows(),
    queryFn: () => analyticsV2Service.getTransferFlows(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Recurring Transactions
export function useRecurringTransactions(params?: {
  active_only?: boolean
  min_confidence?: number
  limit?: number
  offset?: number
}) {
  return useQuery<RecurringTransaction[], Error>({
    queryKey: analyticsV2Keys.recurringTransactions({
      active_only: params?.active_only,
      min_confidence: params?.min_confidence,
    }),
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
}

export function useUpdateRecurringTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: RecurringTransactionPatch) =>
      analyticsV2Service.updateRecurringTransaction(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: analyticsV2Keys.all })
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
      queryClient.invalidateQueries({ queryKey: analyticsV2Keys.all })
    },
  })
}

export function useDeleteRecurringTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => analyticsV2Service.deleteRecurringTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: analyticsV2Keys.all })
    },
  })
}

// Merchant Intelligence
export function useMerchantIntelligence(params?: {
  min_transactions?: number
  recurring_only?: boolean
  limit?: number
  offset?: number
}) {
  return useQuery<MerchantIntelligence[], Error>({
    queryKey: analyticsV2Keys.merchantIntelligence({
      min_transactions: params?.min_transactions,
      recurring_only: params?.recurring_only,
    }),
    queryFn: () => analyticsV2Service.getMerchantIntelligence(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Net Worth Snapshots
export function useNetWorthSnapshots(params?: { limit?: number; offset?: number }) {
  return useQuery<NetWorthSnapshot[], Error>({
    queryKey: analyticsV2Keys.netWorth(),
    queryFn: () => analyticsV2Service.getNetWorthSnapshots(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Fiscal Year Summaries
export function useFYSummaries(params?: { limit?: number; offset?: number }) {
  return useQuery<FYSummary[], Error>({
    queryKey: analyticsV2Keys.fySummaries(),
    queryFn: () => analyticsV2Service.getFYSummaries(params),
    staleTime: STABLE_STALE_TIME,
  })
}

// Anomalies
export function useAnomalies(params?: {
  type?: string
  severity?: string
  include_reviewed?: boolean
  limit?: number
  offset?: number
}) {
  return useQuery<Anomaly[], Error>({
    queryKey: analyticsV2Keys.anomalies({
      type: params?.type,
      severity: params?.severity,
      include_reviewed: params?.include_reviewed,
    }),
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
      queryClient.invalidateQueries({ queryKey: [...analyticsV2Keys.all, 'anomalies'] })
    },
  })
}

// Budgets
export function useBudgets(params?: { active_only?: boolean }) {
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
      queryClient.invalidateQueries({ queryKey: [...analyticsV2Keys.all, 'budgets'] })
    },
  })
}

// Goals
export function useGoals(params?: { goal_type?: string; include_achieved?: boolean }) {
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
      queryClient.invalidateQueries({ queryKey: [...analyticsV2Keys.all, 'goals'] })
    },
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
  TransferFlow,
} from '@/services/api/analyticsV2'

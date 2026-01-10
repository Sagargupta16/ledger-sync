/**
 * React Hooks for Calculations API
 * Provides easy-to-use hooks for fetching calculated data from backend
 */

import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import type {
  AccountBalances,
  CategoryBreakdown,
  DailyNetWorth,
  FinancialInsights,
  MonthlyData,
  TopCategory,
  TotalsResponse,
  YearlyData,
} from "../services/calculationsApi";
import { calculationsApi } from "../services/calculationsApi";

interface DateRange {
  start_date?: string;
  end_date?: string;
}

/**
 * Hook to fetch totals (income, expenses, savings)
 */
export function useTotals(dateRange?: DateRange): UseQueryResult<TotalsResponse> {
  return useQuery({
    queryKey: ["calculations", "totals", dateRange],
    queryFn: () => calculationsApi.getTotals(dateRange),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch monthly aggregation
 */
export function useMonthlyAggregation(dateRange?: DateRange): UseQueryResult<MonthlyData> {
  return useQuery({
    queryKey: ["calculations", "monthly", dateRange],
    queryFn: () => calculationsApi.getMonthlyAggregation(dateRange),
    staleTime: 30000,
  });
}

/**
 * Hook to fetch yearly aggregation
 */
export function useYearlyAggregation(dateRange?: DateRange): UseQueryResult<YearlyData> {
  return useQuery({
    queryKey: ["calculations", "yearly", dateRange],
    queryFn: () => calculationsApi.getYearlyAggregation(dateRange),
    staleTime: 30000,
  });
}

/**
 * Hook to fetch category breakdown
 */
export function useCategoryBreakdown(
  dateRange?: DateRange,
  transactionType?: "Income" | "Expense"
): UseQueryResult<CategoryBreakdown> {
  return useQuery({
    queryKey: ["calculations", "category-breakdown", dateRange, transactionType],
    queryFn: () => calculationsApi.getCategoryBreakdown(dateRange, transactionType),
    staleTime: 30000,
  });
}

/**
 * Hook to fetch account balances
 */
export function useAccountBalances(dateRange?: DateRange): UseQueryResult<AccountBalances> {
  return useQuery({
    queryKey: ["calculations", "account-balances", dateRange],
    queryFn: () => calculationsApi.getAccountBalances(dateRange),
    staleTime: 30000,
  });
}

/**
 * Hook to fetch financial insights
 */
export function useFinancialInsights(dateRange?: DateRange): UseQueryResult<FinancialInsights> {
  return useQuery({
    queryKey: ["calculations", "insights", dateRange],
    queryFn: () => calculationsApi.getFinancialInsights(dateRange),
    staleTime: 30000,
  });
}

/**
 * Hook to fetch daily net worth data
 */
export function useDailyNetWorth(dateRange?: DateRange): UseQueryResult<DailyNetWorth> {
  return useQuery({
    queryKey: ["calculations", "daily-net-worth", dateRange],
    queryFn: () => calculationsApi.getDailyNetWorth(dateRange),
    staleTime: 30000,
  });
}

/**
 * Hook to fetch top categories
 */
export function useTopCategories(
  dateRange?: DateRange,
  limit: number = 10,
  transactionType?: "Income" | "Expense"
): UseQueryResult<TopCategory[]> {
  return useQuery({
    queryKey: ["calculations", "top-categories", dateRange, limit, transactionType],
    queryFn: () => calculationsApi.getTopCategories(dateRange, limit, transactionType),
    staleTime: 30000,
  });
}

/**
 * Helper hook to format date range from Date objects
 */
export function useDateRangeFormat(startDate?: Date, endDate?: Date): DateRange | undefined {
  if (!startDate && !endDate) return undefined;

  return {
    start_date: startDate?.toISOString().split("T")[0],
    end_date: endDate?.toISOString().split("T")[0],
  };
}

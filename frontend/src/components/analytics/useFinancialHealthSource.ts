/**
 * Where FinancialHealthScore's analysis comes from.
 *
 * The Dashboard renders it with no props, and the analysis is computed
 * server-side over the whole ledger (`/api/dashboard-metrics/health`), so the
 * page never downloads `/api/transactions/all`. A caller that already holds a
 * ledger passes it as `transactions`, and the same analysis is computed in the
 * browser by `currentHealthFromLedger`, which the backend ports.
 */

import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { useAccountClassifications } from '@/hooks/api/useAccountClassifications'
import { useAccountBalances } from '@/hooks/api/useAnalytics'
import { dashboardHealthOptions } from '@/hooks/api/useDashboardMetricsApi'
import { usePreferences } from '@/hooks/api/usePreferences'
import type { Transaction } from '@/types'

import { currentHealthFromLedger, type CurrentHealth } from './health/currentHealthInputs'

export interface HealthSource {
  readonly currentHealth: CurrentHealth | null
  readonly savingsGoalPercent: number
  readonly isLoading: boolean
  readonly isError: boolean
  readonly retry: () => void
}

/** The analysis computed server-side, as the Dashboard reads it. */
export function useServerHealth(): HealthSource {
  const preferencesQuery = usePreferences()
  const healthQuery = useQuery(dashboardHealthOptions())
  return {
    currentHealth: healthQuery.data ?? null,
    savingsGoalPercent: preferencesQuery.data?.savings_goal_percent ?? 20,
    isLoading: preferencesQuery.isLoading || healthQuery.isLoading,
    isError: preferencesQuery.isError || healthQuery.isError,
    retry: () => {
      void preferencesQuery.refetch()
      void healthQuery.refetch()
    },
  }
}

/** The same analysis over a ledger the caller already holds. */
export function useLedgerHealth(transactions: readonly Transaction[]): HealthSource {
  const preferencesQuery = usePreferences()
  const balancesQuery = useAccountBalances()
  const classificationsQuery = useAccountClassifications()
  const preferences = preferencesQuery.data
  const accounts = balancesQuery.data?.accounts
  const classifications = classificationsQuery.data
  const currentHealth = useMemo(
    () => currentHealthFromLedger(transactions, { preferences, accounts, classifications }),
    [transactions, preferences, accounts, classifications],
  )
  return {
    currentHealth,
    savingsGoalPercent: preferences?.savings_goal_percent ?? 20,
    isLoading: preferencesQuery.isLoading || balancesQuery.isLoading || classificationsQuery.isLoading,
    isError: preferencesQuery.isError || balancesQuery.isError || classificationsQuery.isError,
    retry: () => {
      void preferencesQuery.refetch()
      void balancesQuery.refetch()
      void classificationsQuery.refetch()
    },
  }
}

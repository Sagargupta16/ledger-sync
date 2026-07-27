import type { TimeRange, Transaction } from '@/types'
import { apiClient } from './client'

export interface OverviewData {
  total_income: number
  total_expenses: number
  net_change: number
  best_month: { month: string; surplus: number } | null
  worst_month: { month: string; surplus: number } | null
  asset_allocation: Array<{ account: string; balance: number }>
  transaction_count: number
}

export interface BehaviorData {
  avg_transaction_size: number
  spending_frequency: number
  convenience_spending_pct: number
  lifestyle_inflation: number
  top_categories: Array<{ category: string; amount: number }>
}

export interface TrendsData {
  monthly_trends: Array<{
    month: string
    income: number
    expenses: number
    surplus: number
  }>
  surplus_trend: Array<{ month: string; surplus: number }>
  consistency_score: number
  /**
   * False when `consistency_score` is the backend's undefined-case sentinel
   * rather than a measurement. A coefficient of variation needs two months and a
   * non-zero mean; outside that the score is a flat 100, which reads as the BEST
   * possible result. Never render the score without checking this.
   */
  consistency_measurable: boolean
}

export interface KPIData {
  savings_rate: number
  daily_spending_rate: number
  monthly_burn_rate: number
  spending_velocity: number
  /**
   * False when there is no history outside the recent window, where
   * `spending_velocity` comes back 0 -- indistinguishable from "spending is 100%
   * down" for a user whose whole ledger is inside that window.
   */
  velocity_comparable: boolean
  category_concentration: number
  consistency_score: number
  /** See `TrendsData.consistency_measurable`. */
  consistency_measurable: boolean
  lifestyle_inflation: number
  convenience_spending_pct: number
}

/**
 * Every method here sends only parameters its endpoint actually declares.
 *
 * FastAPI silently DROPS an unknown query param -- no 422, no warning -- so a
 * call that sends one compiles, type-checks, returns 200, and quietly ignores
 * the thing the caller asked for. `__tests__/analyticsParamContract.test.ts`
 * pins each method's params against the backend signature; read that file's
 * `DECLARED_PARAMS` before adding a param here.
 */
export const analyticsService = {
  /**
   * `time_range`, not a date window: `get_kpis`
   * (`backend/src/ledger_sync/api/analytics.py`) declares `time_range` and
   * nothing else. This used to take `{ start_date, end_date }`, which FastAPI
   * dropped on the floor -- so a date-filtered KPI request silently answered
   * with all-time figures. Narrowing the type here is the frontend half; giving
   * the endpoint a real date window would be a backend change.
   */
  getKPIs: async (params?: { time_range?: TimeRange }) => {
    const response = await apiClient.get<KPIData>('/api/analytics/kpis', { params })
    return response.data
  },

  /**
   * Newest-first ordering comes from the ENDPOINT, not from a param:
   * `get_transactions` hardcodes `order_by(Transaction.date.desc())` at
   * `backend/src/ledger_sync/api/transactions.py:359` and declares only
   * `start_date` / `end_date` / `limit` / `offset` (lines 332-335).
   *
   * `sort` / `sort_order` were sent here for exactly that reason and read like a
   * working sort contract, but FastAPI dropped both -- and `sort_order` is not
   * even the right name: the one endpoint that does sort,
   * `GET /api/transactions/search`, spells it `sort_by` / `sort_order`
   * (transactions.py:510-515). Do not re-add them; change the endpoint instead.
   */
  getRecentTransactions: async (limit: number = 5): Promise<Transaction[]> => {
    const response = await apiClient.get<{ data: Transaction[] } | Transaction[]>('/api/transactions', {
      params: { limit },
    })
    // Handle both old array format and new paginated format
    const data = response.data
    if (Array.isArray(data)) {
      return data.slice(0, limit)
    }
    return (data?.data || []).slice(0, limit)
  },

  getOverview: async (timeRange: TimeRange = 'all_time') => {
    const response = await apiClient.get<OverviewData>('/api/analytics/overview', {
      params: { time_range: timeRange },
    })
    return response.data
  },

  getBehavior: async (timeRange: TimeRange = 'all_time') => {
    const response = await apiClient.get<BehaviorData>('/api/analytics/behavior', {
      params: { time_range: timeRange },
    })
    return response.data
  },

  getTrends: async (timeRange: TimeRange = 'all_time') => {
    const response = await apiClient.get<TrendsData>('/api/analytics/trends', {
      params: { time_range: timeRange },
    })
    return response.data
  },
}

/**
 * Live backend endpoints this client deliberately no longer wraps.
 *
 * `GET /api/analytics/wrapped`, `/charts/income-expense`, `/charts/categories`,
 * `/charts/monthly-trends`, `/charts/account-distribution` and
 * `/insights/generated` all still exist and are still tested server-side. Their
 * client methods had zero call sites anywhere under `src/` -- including tests --
 * and three of them had a TanStack hook that nothing mounted either. Untyped
 * dead wrappers are how the `GeneratedInsight` response shape drifted wrong on
 * every single field without a compile error: nothing consumed it, so nothing
 * disagreed.
 *
 * Unlike `useKPIs` / `useOverview` / `useBehavior` -- which
 * `lib/demo/__tests__/seedReaderContract.test.tsx` pins as
 * consumerless-but-serviceable because `DEMO_ROUTES` still answers them -- none
 * of the six above had a `DEMO_ROUTES` entry, so in demo mode they resolved the
 * `[]` catch-all and would have rendered an empty chart rather than data. They
 * were not serviceable, only present.
 *
 * Re-add one as a four-line method when a page actually needs it, and add its
 * params to `DECLARED_PARAMS` in `__tests__/analyticsParamContract.test.ts`.
 */

import axios, { type AxiosRequestConfig } from 'axios'
import { API_BASE_URL } from '@/constants'
import { useAuthStore, getAccessToken, getRefreshToken } from '@/store/authStore'
import { isDemoMode } from '@/store/demoStore'
import { getDemoTransactions } from '@/lib/demo/seedDemoCache'
import {
  generateDemoTotals,
  generateDemoMonthlyAggregation,
  generateDemoAccountBalances,
  generateDemoCategoryBreakdown,
  generateDemoKPIs,
  generateDemoOverview,
  generateDemoBehavior,
  generateDemoTrends,
  generateDemoMonthlySummaries,
  generateDemoCategoryTrends,
  generateDemoRecurring,
  generateDemoNetWorth,
  generateDemoFYSummaries,
  generateDemoAnomalies,
  generateDemoBudgets,
  generateDemoGoals,
} from '@/lib/demo/generateDerivedData'
import {
  generateDemoAccountClassifications,
  generateDemoCategoryDailySeries,
  generateDemoCategoryMonthlyHistory,
  generateDemoCohortSpending,
  generateDemoDailySummaries,
  generateDemoDataDateRange,
  generateDemoFacets,
  generateDemoInvestmentHoldings,
  generateDemoMerchantIntelligence,
  generateDemoQuickInsights,
  generateDemoSavedViews,
  generateDemoSearch,
  generateDemoSpendingRule,
  generateDemoTransferFlows,
} from '@/lib/demo/demoComputedReads'
import type { Transaction } from '@/types'

/** V2 list endpoints are wrapped as { data, count }. */
function wrap<T>(rows: T[]): { data: T[]; count: number } {
  return { data: rows, count: rows.length }
}

type DemoResolver = (txs: Transaction[], params: Record<string, unknown>) => unknown

/**
 * Ordered demo-route table: first URL-substring match wins, so specific
 * paths (facets, search, v2 endpoints) MUST precede their generic prefixes
 * ('/transactions', '/analytics/v2/'). Pages can hit these with non-default
 * params that miss the seeded cache keys, so the adapter answers everything.
 */
const DEMO_ROUTES: ReadonlyArray<readonly [string, DemoResolver]> = [
  ['/api/ai/tools', () => ({ tools: [] })],
  // Calculations
  ['/calculations/totals', (txs, params) => generateDemoTotals(txs, params)],
  ['/calculations/monthly-aggregation', (txs, params) => generateDemoMonthlyAggregation(txs, params)],
  ['/calculations/account-balances', (txs) => generateDemoAccountBalances(txs)],
  ['/calculations/category-breakdown', (txs, params) => generateDemoCategoryBreakdown(txs, params)],
  ['/calculations/quick-insights', (txs) => generateDemoQuickInsights(txs)],
  ['/calculations/data-date-range', (txs) => generateDemoDataDateRange(txs)],
  [
    '/calculations/category-monthly-history',
    (txs, params) =>
      generateDemoCategoryMonthlyHistory(
        txs,
        Array.isArray(params.months) ? (params.months as string[]) : [],
        params.transaction_type === 'income' ? 'income' : 'expense',
      ),
  ],
  ['/calculations/category-daily-series', (txs, params) => generateDemoCategoryDailySeries(txs, params)],
  // Analytics V1
  ['/analytics/kpis', (txs) => generateDemoKPIs(txs)],
  // Analytics V2 -- specific endpoints first, generic {data: []} last.
  ['/analytics/v2/spending-rule', (txs, params) => generateDemoSpendingRule(txs, params)],
  ['/analytics/v2/cohort-spending', (txs) => ({ data: generateDemoCohortSpending(txs) })],
  ['/analytics/v2/daily-summaries', (txs) => wrap(generateDemoDailySummaries(txs))],
  ['/analytics/v2/transfer-flows', (txs) => wrap(generateDemoTransferFlows(txs))],
  ['/analytics/v2/merchant-intelligence', (txs) => wrap(generateDemoMerchantIntelligence(txs))],
  ['/analytics/v2/investment-holdings', (txs) => wrap(generateDemoInvestmentHoldings(txs))],
  ['/analytics/v2/monthly-summaries', (txs) => wrap(generateDemoMonthlySummaries(txs))],
  ['/analytics/v2/category-trends', (txs) => wrap(generateDemoCategoryTrends(txs))],
  [
    '/analytics/v2/recurring-transactions',
    (_txs, params) => {
      const rows = generateDemoRecurring()
      return wrap(params.active_only ? rows.filter((r) => r.is_active) : rows)
    },
  ],
  ['/analytics/v2/net-worth', (txs) => wrap(generateDemoNetWorth(txs))],
  ['/analytics/v2/fy-summaries', (txs) => wrap(generateDemoFYSummaries(txs))],
  [
    '/analytics/v2/anomalies',
    (_txs, params) => {
      const rows = generateDemoAnomalies()
      return wrap(params.include_reviewed === false ? rows.filter((a) => !a.is_reviewed) : rows)
    },
  ],
  ['/analytics/v2/budgets', () => wrap(generateDemoBudgets())],
  ['/analytics/v2/goals', () => wrap(generateDemoGoals())],
  ['/analytics/v2/', () => ({ data: [], count: 0 })],
  ['/analytics/overview', (txs) => generateDemoOverview(txs)],
  ['/analytics/behavior', (txs) => generateDemoBehavior(txs)],
  ['/analytics/trends', (txs) => generateDemoTrends(txs)],
  // Transactions -- facets and paginated search before the generic list.
  ['/transactions/facets', (txs) => generateDemoFacets(txs)],
  ['/transactions/search', (txs, params) => generateDemoSearch(txs, params)],
  ['/saved-views', () => generateDemoSavedViews()],
  // Closed-accounts list must precede the generic prefix match below.
  ['/account-classifications/closed', () => []],
  ['/account-classifications', () => generateDemoAccountClassifications()],
  ['/transactions', (txs, params) => txs.slice(0, (params.limit as number) || txs.length)],
]

function resolveDemoData(url: string, params: Record<string, unknown>, txs: Transaction[]): unknown {
  const route = DEMO_ROUTES.find(([prefix]) => url.includes(prefix))
  return route ? route[1](txs, params) : []
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Demo mode interceptor -- blocks all real API calls when demo is active.
// For GET requests, returns computed data; for mutations, rejects.
apiClient.interceptors.request.use(
  (config) => {
    if (!isDemoMode()) return config

    // Block mutations in demo mode
    const method = config.method?.toLowerCase()
    if (method && method !== 'get') {
      return Promise.reject(new Error('Mutations are disabled in demo mode'))
    }

    // For GET requests, return mock data via adapter override
    config.adapter = () => {
      const url = config.url || ''
      const params = config.params || {}
      const txs = getDemoTransactions()

      const data = resolveDemoData(url, params, txs)
      return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config })
    }

    return config
  },
  (error) => Promise.reject(error),
)

// Request interceptor -- always attach the token if one exists.
// If it's expired, the server returns 401, and the response interceptor
// handles the refresh transparently.
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// --- Token refresh mutex ---
// Prevents multiple concurrent 401s from each firing their own refresh request.
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  for (const { resolve, reject } of failedQueue) {
    if (error || !token) {
      reject(error ?? new Error('Token refresh failed'))
    } else {
      resolve(token)
    }
  }
  failedQueue = []
}

// Response interceptor for error handling and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

    // If 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      // If a refresh is already in-flight, queue this request
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers = { ...originalRequest.headers, Authorization: `Bearer ${token}` }
          return apiClient(originalRequest)
        })
      }

      const refreshTokenValue = getRefreshToken()
      if (refreshTokenValue) {
        isRefreshing = true
        try {
          // Try to refresh the token
          const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
            refresh_token: refreshTokenValue,
          })

          const { access_token, refresh_token } = response.data

          // Update store with new tokens
          useAuthStore.getState().setTokens({
            access_token,
            refresh_token,
            token_type: 'bearer',
          })

          // Replay all queued requests with the new token
          processQueue(null, access_token)

          // Retry the original request with new token
          originalRequest.headers = { ...originalRequest.headers, Authorization: `Bearer ${access_token}` }
          return apiClient(originalRequest)
        } catch (refreshError) {
          // Reject all queued requests
          processQueue(refreshError, null)
          // Refresh failed - logout user
          useAuthStore.getState().logout()
          throw refreshError
        } finally {
          isRefreshing = false
        }
      } else {
        // No refresh token - logout
        useAuthStore.getState().logout()
      }
    }

    throw error
  }
)

export default apiClient

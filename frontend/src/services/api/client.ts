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

function resolveDemoData(url: string, params: Record<string, unknown>, txs: Transaction[]): unknown {
  if (url.includes('/api/ai/tools')) return { tools: [] }
  // Calculations
  if (url.includes('/calculations/totals')) return generateDemoTotals(txs, params)
  if (url.includes('/calculations/monthly-aggregation')) return generateDemoMonthlyAggregation(txs, params)
  if (url.includes('/calculations/account-balances')) return generateDemoAccountBalances(txs)
  if (url.includes('/calculations/category-breakdown')) return generateDemoCategoryBreakdown(txs, params)
  if (url.includes('/calculations/quick-insights')) return generateDemoQuickInsights(txs)
  if (url.includes('/calculations/data-date-range')) return generateDemoDataDateRange(txs)
  if (url.includes('/calculations/category-monthly-history')) {
    return generateDemoCategoryMonthlyHistory(
      txs,
      Array.isArray(params.months) ? (params.months as string[]) : [],
      params.transaction_type === 'income' ? 'income' : 'expense',
    )
  }
  if (url.includes('/calculations/category-daily-series')) return generateDemoCategoryDailySeries(txs, params)
  // Analytics V1
  if (url.includes('/analytics/kpis')) return generateDemoKPIs(txs)
  // Analytics V2 -- specific endpoints first, generic {data: []} last.
  // (The palette/filter pages hit these with non-default params, which miss
  // the seeded cache keys -- so the adapter must answer them all directly.)
  if (url.includes('/analytics/v2/spending-rule')) return generateDemoSpendingRule(txs, params)
  if (url.includes('/analytics/v2/cohort-spending')) return { data: generateDemoCohortSpending(txs) }
  if (url.includes('/analytics/v2/daily-summaries')) return wrap(generateDemoDailySummaries(txs))
  if (url.includes('/analytics/v2/transfer-flows')) return wrap(generateDemoTransferFlows(txs))
  if (url.includes('/analytics/v2/merchant-intelligence')) return wrap(generateDemoMerchantIntelligence(txs))
  if (url.includes('/analytics/v2/investment-holdings')) return wrap(generateDemoInvestmentHoldings(txs))
  if (url.includes('/analytics/v2/monthly-summaries')) return wrap(generateDemoMonthlySummaries(txs))
  if (url.includes('/analytics/v2/category-trends')) return wrap(generateDemoCategoryTrends(txs))
  if (url.includes('/analytics/v2/recurring-transactions')) {
    const rows = generateDemoRecurring()
    return wrap(params.active_only ? rows.filter((r) => r.is_active) : rows)
  }
  if (url.includes('/analytics/v2/net-worth')) return wrap(generateDemoNetWorth(txs))
  if (url.includes('/analytics/v2/fy-summaries')) return wrap(generateDemoFYSummaries(txs))
  if (url.includes('/analytics/v2/anomalies')) {
    const rows = generateDemoAnomalies()
    return wrap(params.include_reviewed === false ? rows.filter((a) => !a.is_reviewed) : rows)
  }
  if (url.includes('/analytics/v2/budgets')) return wrap(generateDemoBudgets())
  if (url.includes('/analytics/v2/goals')) return wrap(generateDemoGoals())
  if (url.includes('/analytics/v2/')) return { data: [], count: 0 }
  if (url.includes('/analytics/overview')) return generateDemoOverview(txs)
  if (url.includes('/analytics/behavior')) return generateDemoBehavior(txs)
  if (url.includes('/analytics/trends')) return generateDemoTrends(txs)
  // Transactions -- facets and paginated search before the generic list.
  if (url.includes('/transactions/facets')) return generateDemoFacets(txs)
  if (url.includes('/transactions/search')) return generateDemoSearch(txs, params)
  if (url.includes('/saved-views')) return generateDemoSavedViews()
  if (url.includes('/account-classifications')) return generateDemoAccountClassifications()
  if (url.includes('/transactions')) return txs.slice(0, (params.limit as number) || txs.length)
  return []
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

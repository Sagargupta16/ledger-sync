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
} from '@/lib/demo/generateDerivedData'
import type { Transaction } from '@/types'

function resolveDemoData(url: string, params: Record<string, unknown>, txs: Transaction[]): unknown {
  if (url.includes('/calculations/totals')) return generateDemoTotals(txs, params as { start_date?: string; end_date?: string })
  if (url.includes('/calculations/monthly-aggregation')) return generateDemoMonthlyAggregation(txs, params as { start_date?: string; end_date?: string })
  if (url.includes('/calculations/account-balances')) return generateDemoAccountBalances(txs)
  if (url.includes('/calculations/category-breakdown')) return generateDemoCategoryBreakdown(txs, params as { start_date?: string; end_date?: string; transaction_type?: 'income' | 'expense' })
  if (url.includes('/analytics/kpis')) return generateDemoKPIs(txs)
  if (url.includes('/analytics/v2/')) return { data: [], count: 0 }
  if (url.includes('/analytics/overview')) return generateDemoOverview(txs)
  if (url.includes('/analytics/behavior')) return generateDemoBehavior(txs)
  if (url.includes('/analytics/trends')) return generateDemoTrends(txs)
  if (url.includes('/transactions')) return txs.slice(0, (params.limit as number) || txs.length)
  return []
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Demo mode interceptor — blocks all real API calls when demo is active.
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

// Request interceptor — always attach the token if one exists.
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

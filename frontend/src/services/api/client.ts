import axios, { AxiosHeaders, type AxiosRequestConfig } from 'axios'
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
  generateDemoDataHealth,
} from '@/lib/demo/generateDerivedData'
import {
  generateDemoAccountClassifications,
  generateDemoAccountsByType,
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
import { generateDemoAiUsage } from '@/lib/demo/demoAiUsage'
import { generateDemoExportBlob } from '@/lib/demo/demoExport'
import { generateDemoIncomeAnalysis } from '@/lib/demo/demoIncomeAnalysis'
import type { AuthTokens, Transaction } from '@/types'

/** V2 list endpoints are wrapped as { data, count }. */
function wrap<T>(rows: T[]): { data: T[]; count: number } {
  return { data: rows, count: rows.length }
}

type DemoResolver = (
  txs: Transaction[],
  params: Record<string, unknown>,
  url: string,
) => unknown

/**
 * Ordered demo-route table: first URL-substring match wins, so specific
 * paths (facets, search, v2 endpoints) MUST precede their generic prefixes
 * ('/transactions', '/analytics/v2/'). Pages can hit these with non-default
 * params that miss the seeded cache keys, so the adapter answers everything.
 */
const DEMO_ROUTES: ReadonlyArray<readonly [string, DemoResolver]> = [
  ['/api/ai/tools', () => ({ tools: [] })],
  // The rollup panels read `usage.today.total_tokens` and
  // `limits.app_daily_messages` directly, so the catch-all's `[]` rendered
  // "NaN / 10 left" and threw in the BYOK panel. Full shape or nothing.
  ['/api/ai/usage', () => generateDemoAiUsage()],
  // Calculations
  ['/calculations/totals', (txs, params) => generateDemoTotals(txs, params)],
  ['/calculations/monthly-aggregation', (txs, params) => generateDemoMonthlyAggregation(txs, params)],
  ['/calculations/account-balances', (txs) => generateDemoAccountBalances(txs)],
  ['/calculations/category-breakdown', (txs, params) => generateDemoCategoryBreakdown(txs, params)],
  ['/calculations/quick-insights', (txs) => generateDemoQuickInsights(txs)],
  ['/calculations/data-date-range', (txs) => generateDemoDataDateRange(txs)],
  ['/calculations/income-analysis', (txs, params) => generateDemoIncomeAnalysis(txs, params)],
  [
    '/calculations/category-monthly-history',
    (txs, params) =>
      generateDemoCategoryMonthlyHistory(
        txs,
        // `calculations.getCategoryMonthlyHistory` sends `months.join(',')`, so
        // the param is a comma-joined STRING here -- axios only expands arrays
        // on the wire, and the demo adapter reads `config.params` before that.
        // An `Array.isArray` test never matched, so every sparkline and every
        // "/mo avg" on the demo Category Breakdown came back empty.
        typeof params.months === 'string' ? params.months.split(',') : [],
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
      let rows = generateDemoRecurring()
      if (params.active_only) rows = rows.filter((r) => r.is_active)
      if (params.pattern_kind) rows = rows.filter((r) => r.pattern_kind === params.pattern_kind)
      return wrap(rows)
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
  // Bare object, not a { data, count } list -- and it must precede the catch-all
  // below, whose empty-list shape fails assertDataHealth and hangs the page.
  ['/analytics/v2/data-health', (txs) => generateDemoDataHealth(txs)],
  ['/analytics/v2/', () => ({ data: [], count: 0 })],
  ['/analytics/overview', (txs) => generateDemoOverview(txs)],
  ['/analytics/behavior', (txs) => generateDemoBehavior(txs)],
  ['/analytics/trends', (txs) => generateDemoTrends(txs)],
  // Transactions -- facets, export and paginated search before the generic list.
  ['/transactions/facets', (txs) => generateDemoFacets(txs)],
  // CSV export answers a Blob, not JSON, and MUST stay above '/transactions':
  // the generic route returns an array, `URL.createObjectURL` rejects it, and
  // the page toasts "Export failed".
  ['/transactions/export', (txs, params) => generateDemoExportBlob(txs, params)],
  ['/transactions/search', (txs, params) => generateDemoSearch(txs, params)],
  ['/saved-views', () => generateDemoSavedViews()],
  // Closed-accounts list must precede the generic prefix match below.
  ['/account-classifications/closed', () => []],
  // Same ordering requirement: `/type/{type}` returns `{ accounts: [...] }`, a
  // different shape from the name -> classification map the generic route serves.
  [
    '/account-classifications/type/',
    (_txs, _params, url) =>
      generateDemoAccountsByType(decodeURIComponent(url.split('/account-classifications/type/')[1] ?? '')),
  ],
  ['/account-classifications', () => generateDemoAccountClassifications()],
  ['/transactions', (txs, params) => txs.slice(0, (params.limit as number) || txs.length)],
]

function resolveDemoData(url: string, params: Record<string, unknown>, txs: Transaction[]): unknown {
  const route = DEMO_ROUTES.find(([prefix]) => url.includes(prefix))
  return route ? route[1](txs, params, url) : []
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
      const url = config.url ?? ''
      const params = (config.params ?? {}) as Record<string, unknown>
      const txs = getDemoTransactions()

      const data = resolveDemoData(url, params, txs)
      return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config })
    }

    return config
  },
  // Re-throw instead of `Promise.reject(error)`: axios turns a throw inside a
  // rejection handler into the same rejected promise with the same value, and
  // rethrowing keeps a non-Error rejection intact rather than wrapping it.
  (error: unknown) => {
    throw error
  },
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
  // Re-throw rather than `Promise.reject(error)` -- see the demo interceptor
  // above; axios produces the identical rejected promise either way.
  (error: unknown) => {
    throw error
  },
)

/**
 * Swap in a fresh bearer token, keeping every other header.
 *
 * `AxiosHeaders.set()` rather than an object spread: by the time a response
 * interceptor runs, `config.headers` is an `AxiosHeaders` instance, and header
 * names are case-insensitive. Spreading it produces a plain object, so an
 * existing `authorization` key would survive alongside the new `Authorization`
 * one -- two entries for the same header, resolved by insertion order. `set()`
 * matches case-insensitively and replaces in place.
 */
function withBearer(headers: AxiosRequestConfig['headers'], token: string): AxiosHeaders {
  return AxiosHeaders.from(headers as never).set('Authorization', `Bearer ${token}`)
}

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
  // `unknown` + a narrowing guard rather than the implicit `any` axios hands
  // over. This handler is the auth backbone, and untyped it read
  // `error.config`, `error.response.status` and the refresh payload's
  // `access_token` off `any` -- so a refresh response missing `access_token`
  // would have set the literal header `Bearer undefined` and put every
  // subsequent request into a silent 401 loop with no error anywhere.
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error

    const originalRequest = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined

    // If 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true

      // If a refresh is already in-flight, queue this request
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers = withBearer(originalRequest.headers, token)
          return apiClient(originalRequest)
        })
      }

      const refreshTokenValue = getRefreshToken()
      if (refreshTokenValue) {
        isRefreshing = true
        let freshAccessToken: string
        try {
          // Try to refresh the token
          const response = await axios.post<AuthTokens>(`${API_BASE_URL}/api/auth/refresh`, {
            refresh_token: refreshTokenValue,
          })

          const { access_token, refresh_token } = response.data
          // Guard the field the whole session hangs on. Untyped, a malformed
          // refresh response flowed straight into `Bearer undefined`; failing
          // here instead routes to the catch below, which logs the user out
          // cleanly rather than leaving them in a broken signed-in state.
          if (!access_token) throw new Error('Token refresh returned no access token')

          // Update store with new tokens
          useAuthStore.getState().setTokens({
            access_token,
            refresh_token,
            token_type: 'bearer',
          })

          // Replay all queued requests with the new token
          processQueue(null, access_token)
          freshAccessToken = access_token
        } catch (refreshError) {
          // Reject all queued requests
          processQueue(refreshError, null)
          // Refresh failed - logout user
          useAuthStore.getState().logout()
          throw refreshError
        } finally {
          isRefreshing = false
        }

        // Retry the original request with new token.
        // Deliberately OUTSIDE the try above: the catch means "refresh failed"
        // (reject the queue, log out). A retried request that fails for an
        // unrelated reason -- 500, network drop -- must not be treated as a
        // failed refresh, which is what `return await` inside the try would do.
        originalRequest.headers = withBearer(originalRequest.headers, freshAccessToken)
        return apiClient(originalRequest)
      } else {
        // No refresh token - logout
        useAuthStore.getState().logout()
      }
    }

    throw error
  }
)

export default apiClient

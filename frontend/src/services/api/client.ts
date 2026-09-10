import axios, { AxiosHeaders, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { API_BASE_URL } from '@/constants'
import { useAuthStore, getAccessToken, getRefreshToken } from '@/store/authStore'
import { isDemoMode } from '@/store/demoStore'
import { getDemoTransactions } from '@/lib/demo/seedDemoCache'
import { assertCurrentSession, endSession, getSessionSignal, isCurrentSession } from '@/lib/session'
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
  generateDemoIncomeFacets,
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
  ['/calculations/income-facets', (txs) => generateDemoIncomeFacets(txs)],
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

type SessionRequest = InternalAxiosRequestConfig & {
  _retry?: boolean
  _sessionSignal?: AbortSignal
}

function isOAuthRequest(url: string = ''): boolean {
  return url.split('?')[0].startsWith('/api/auth/oauth/')
}

// Capture the session synchronously, before the caller can log out or switch
// identities. Retries keep the original signal and cannot borrow a new login.
apiClient.interceptors.request.use(
  (config) => {
    const request = config as SessionRequest
    request._sessionSignal ??= getSessionSignal()
    assertCurrentSession(request._sessionSignal)
    request.signal = config.signal
      ? AbortSignal.any([config.signal as AbortSignal, request._sessionSignal])
      : request._sessionSignal

    const oauthRequest = isOAuthRequest(config.url)
    const token = getAccessToken()
    if (token && !oauthRequest && !isDemoMode()) {
      config.headers.set('Authorization', `Bearer ${token}`)
    } else {
      config.headers.delete('Authorization')
    }

    // Provider discovery and code exchange must work from the demo sign-up.
    if (!isDemoMode() || oauthRequest) return config

    if (config.method && config.method.toLowerCase() !== 'get') {
      throw new Error('Mutations are disabled in demo mode')
    }

    config.adapter = () => {
      const url = config.url ?? ''
      const params = (config.params ?? {}) as Record<string, unknown>
      const data = resolveDemoData(url, params, getDemoTransactions())
      return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config })
    }

    return config
  },
  (error: unknown) => {
    throw error
  },
  { synchronous: true },
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

// Concurrent 401s share one refresh within their original session only.
let pendingRefresh: { signal: AbortSignal; promise: Promise<string> } | null = null

function refreshAccessToken(signal: AbortSignal): Promise<string> {
  assertCurrentSession(signal)
  if (pendingRefresh?.signal === signal) return pendingRefresh.promise

  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    endSession()
    return Promise.reject(new Error('Your session has expired. Please sign in again.'))
  }

  const promise = axios.post<AuthTokens>(
    `${API_BASE_URL}/api/auth/refresh`,
    { refresh_token: refreshToken },
    { signal },
  ).then(({ data }) => {
    assertCurrentSession(signal)
    if (!data.access_token || !data.refresh_token) {
      throw new Error('Token refresh returned incomplete tokens')
    }
    useAuthStore.getState().setTokens(data)
    return data.access_token
  }).catch((error: unknown) => {
    // A late refresh failure must never log out a newer session.
    if (isCurrentSession(signal)) endSession()
    throw error
  }).finally(() => {
    if (pendingRefresh?.signal === signal) pendingRefresh = null
  })

  pendingRefresh = { signal, promise }
  return promise
}

// Response interceptor for error handling and token refresh
apiClient.interceptors.response.use(
  (response) => {
    const signal = (response.config as SessionRequest)._sessionSignal
    if (signal) assertCurrentSession(signal)
    return response
  },
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error

    const request = error.config as SessionRequest | undefined
    if (request?._sessionSignal) assertCurrentSession(request._sessionSignal)
    if (error.response?.status !== 401 || !request || isOAuthRequest(request.url)) throw error

    if (request._retry) {
      endSession()
      throw error
    }

    request._retry = true
    const signal = request._sessionSignal ?? getSessionSignal()
    const token = await refreshAccessToken(signal)
    assertCurrentSession(signal)
    request.headers = withBearer(request.headers, token)
    return apiClient(request)
  }
)

export default apiClient

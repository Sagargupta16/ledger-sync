import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { AxiosAdapter } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '@/lib/queryClient'
import { makeRecoveryGoal } from '@/pages/goals/__tests__/goalRecoveryFixtures'
import { apiClient } from '@/services/api/client'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'

import {
  useCreateBudget,
  useCreateGoal,
  useCreateRecurringTransaction,
  useDeleteGoal,
  useDeleteRecurringTransaction,
  useReviewAnomaly,
  useUpdateGoal,
  useUpdateRecurringTransaction,
} from '../api/useAnalyticsV2'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const originalAdapter = apiClient.defaults.adapter
const mutationCache = queryClient.getMutationCache()
const originalOnMutate = mutationCache.config.onMutate
const originalOnSuccess = mutationCache.config.onSuccess

function signIn(id = 71) {
  useAuthStore.getState().login({
    id, email: `goal-session-${id}@example.invalid`, full_name: 'Synthetic reviewer',
    is_active: true, is_verified: true, auth_provider: 'google',
    created_at: '2026-01-01', last_login: null,
  }, { access_token: `synthetic-${id}`, refresh_token: `synthetic-refresh-${id}`, token_type: 'bearer' })
}

function useAnalyticsMutations() {
  const userId = useAuthStore((state) => state.user?.id)
  const createGoal = useCreateGoal()
  const updateGoal = useUpdateGoal()
  const deleteGoal = useDeleteGoal()
  const createRecurring = useCreateRecurringTransaction()
  const updateRecurring = useUpdateRecurringTransaction()
  const deleteRecurring = useDeleteRecurringTransaction()
  const reviewAnomaly = useReviewAnomaly()
  const createBudget = useCreateBudget()
  return {
    userId, createGoal, updateGoal, deleteGoal, createRecurring,
    updateRecurring, deleteRecurring, reviewAnomaly, createBudget,
  }
}

const scenarios = [
  {
    name: 'create goal',
    method: 'post',
    path: '/api/analytics/v2/goals',
    invalidation: ['analyticsV2', 'goals'],
    run: (hooks: ReturnType<typeof useAnalyticsMutations>) => hooks.createGoal.mutateAsync({
      name: 'Account A goal', goal_type: 'savings', target_amount: 100_000, target_date: null,
    }),
  },
  {
    name: 'update goal',
    method: 'patch',
    path: '/api/analytics/v2/goals/101',
    invalidation: ['analyticsV2', 'goals'],
    run: (hooks: ReturnType<typeof useAnalyticsMutations>) => hooks.updateGoal.mutateAsync({
      goalId: 101, data: { name: 'Account A edit', current_amount: 75_000 },
    }),
  },
  {
    name: 'delete goal',
    method: 'delete',
    path: '/api/analytics/v2/goals/101',
    invalidation: ['analyticsV2', 'goals'],
    run: (hooks: ReturnType<typeof useAnalyticsMutations>) => hooks.deleteGoal.mutateAsync(101),
  },
  {
    name: 'create recurring transaction',
    method: 'post',
    path: '/api/analytics/v2/recurring-transactions',
    invalidation: ['analyticsV2'],
    run: (hooks: ReturnType<typeof useAnalyticsMutations>) => hooks.createRecurring.mutateAsync({
      name: 'Account A recurring payment', type: 'expense', frequency: 'monthly', amount: 5_000,
    }),
  },
  {
    name: 'update recurring transaction',
    method: 'patch',
    path: '/api/analytics/v2/recurring-transactions/201',
    invalidation: ['analyticsV2'],
    run: (hooks: ReturnType<typeof useAnalyticsMutations>) => hooks.updateRecurring.mutateAsync({
      id: 201, expected_amount: 6_000,
    }),
  },
  {
    name: 'delete recurring transaction',
    method: 'delete',
    path: '/api/analytics/v2/recurring-transactions/201',
    invalidation: ['analyticsV2'],
    run: (hooks: ReturnType<typeof useAnalyticsMutations>) => hooks.deleteRecurring.mutateAsync(201),
  },
  {
    name: 'review anomaly',
    method: 'post',
    path: '/api/analytics/v2/anomalies/301/review',
    invalidation: ['analyticsV2', 'anomalies'],
    run: (hooks: ReturnType<typeof useAnalyticsMutations>) => hooks.reviewAnomaly.mutateAsync({
      anomalyId: 301, data: { dismiss: true, notes: 'Account A review' },
    }),
  },
  {
    name: 'create budget',
    method: 'post',
    path: '/api/analytics/v2/budgets',
    invalidation: ['analyticsV2', 'budgets'],
    run: (hooks: ReturnType<typeof useAnalyticsMutations>) => hooks.createBudget.mutateAsync({
      category: 'Account A category', monthly_limit: 10_000,
    }),
  },
]

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

function renderMutations() {
  const requests: { method?: string; url?: string; authorization: unknown; body: unknown }[] = []
  const adapter: AxiosAdapter = (config) => {
    requests.push({
      method: config.method,
      url: config.url,
      authorization: config.headers.get('Authorization'),
      body: typeof config.data === 'string' ? JSON.parse(config.data) as unknown : null,
    })
    let data: unknown = { success: true }
    if (config.url?.includes('/recurring-transactions')) data = { status: 'success', id: 201 }
    if (config.url === '/api/analytics/v2/goals') data = { success: true, goal_id: 101 }
    if (config.url === '/api/analytics/v2/goals/101' && config.method === 'patch') {
      data = makeRecoveryGoal({ current_amount: 75_000 })
    }
    if (config.url === '/api/analytics/v2/budgets') data = { success: true, budget_id: 401 }
    return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config })
  }
  apiClient.defaults.adapter = adapter
  const view = renderHook(useAnalyticsMutations, {
    wrapper: ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  })
  return { ...view, requests }
}

beforeEach(() => {
  localStorage.clear()
  useDemoStore.getState().exitDemo()
  signIn()
  queryClient.clear()
})

afterEach(() => {
  cleanup()
  apiClient.defaults.adapter = originalAdapter
  mutationCache.config.onMutate = originalOnMutate
  mutationCache.config.onSuccess = originalOnSuccess
  queryClient.clear()
  vi.restoreAllMocks()
})

describe('Analytics V2 mutation session boundaries', () => {
  it.each(scenarios)('does not dispatch queued $name data after a same-tick account switch', async ({ run }) => {
    const { result, requests } = renderMutations()
    let pending: Promise<unknown> | undefined

    act(() => {
      pending = run(result.current).catch((error: unknown) => error)
      signIn(72)
    })
    await act(async () => { await pending })

    expect(requests).toEqual([])
    expect(await pending).toMatchObject({ code: 'ERR_CANCELED' })
    expect(result.current.userId).toBe(72)
  })

  it.each(scenarios)('keeps queued $name bound to its original session across observer updates', async ({ run }) => {
    const queued = deferred()
    const release = deferred()
    mutationCache.config.onMutate = () => {
      queued.resolve()
      return release.promise
    }
    const { result, requests } = renderMutations()
    let pending: Promise<unknown> | undefined

    await act(async () => {
      pending = run(result.current).catch((error: unknown) => error)
      await queued.promise
    })
    act(() => signIn(72))
    await act(async () => {
      release.resolve()
      await pending
    })

    expect(requests).toEqual([])
    expect(await pending).toMatchObject({ code: 'ERR_CANCELED' })
    expect(result.current.userId).toBe(72)
  })

  it.each(scenarios)('does not invalidate the next account after $name already received a response', async ({ run, invalidation }) => {
    const responded = deferred()
    const release = deferred()
    mutationCache.config.onSuccess = () => {
      responded.resolve()
      return release.promise
    }
    const { result, requests } = renderMutations()
    let pending: Promise<unknown> | undefined

    await act(async () => {
      pending = run(result.current)
      await responded.promise
    })
    act(() => signIn(72))
    const nextAccountKey = [...invalidation, 'account-72']
    queryClient.setQueryData(nextAccountKey, { accountId: 72 })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await act(async () => {
      release.resolve()
      await pending
    })

    expect(requests).toHaveLength(1)
    expect(requests[0].authorization).toBe('Bearer synthetic-71')
    expect(invalidate).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(nextAccountKey)).toEqual({ accountId: 72 })
    expect(queryClient.getQueryState(nextAccountKey)?.isInvalidated).toBe(false)
  })

  it.each(scenarios)('preserves $name transport and cache invalidation in the current account', async ({ run, method, path, invalidation }) => {
    const { result, requests } = renderMutations()
    const accountKey = [...invalidation, 'account-71']
    queryClient.setQueryData(accountKey, { accountId: 71 })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(async () => { await run(result.current) })

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ method, url: path, authorization: 'Bearer synthetic-71' })
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: invalidation })
    expect(queryClient.getQueryState(accountKey)?.isInvalidated).toBe(true)
  })

  it('allows a queued mutation to use refreshed tokens for the same account', async () => {
    const { result, requests } = renderMutations()
    let pending: Promise<unknown> | undefined

    act(() => {
      pending = result.current.createGoal.mutateAsync({
        name: 'Account A goal', goal_type: 'savings', target_amount: 100_000, target_date: null,
      })
      useAuthStore.getState().setTokens({
        access_token: 'synthetic-refreshed-71',
        refresh_token: 'synthetic-refreshed-refresh-71',
        token_type: 'bearer',
      })
    })
    await act(async () => { await pending })

    expect(requests).toHaveLength(1)
    expect(requests[0].authorization).toBe('Bearer synthetic-refreshed-71')
    expect(result.current.userId).toBe(71)
  })
})

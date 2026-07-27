/**
 * Guards the analyticsV2 query-key contract for `seedDemoCache` and
 * `prefetchCoreData`.
 *
 * The trap this prevents: both used to write hand-written
 * `['analyticsV2', ...]` keys with fewer elements than `analyticsV2Keys.*`
 * produces. staleTime is Infinity, so those entries were unreachable -- demo
 * mode only worked because the DEMO_ROUTES interceptor answered the requests,
 * and the prefetches paid for a round-trip nothing could read. Any literal key
 * re-added in either place (or any new factory param) must fail loudly.
 */

import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, hashKey } from '@tanstack/react-query'

import { analyticsV2Keys, useBudgets, useGoals, useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import { analyticsV2Service } from '@/services/api/analyticsV2'
import { calculationsApi } from '@/services/api/calculations'
import { preferencesService } from '@/services/api/preferences'
import { useDemoStore } from '@/store/demoStore'
import { prefetchCoreData } from '@/lib/prefetch'
import { queryClient } from '@/lib/queryClient'
import { seedDemoCache } from '../seedDemoCache'
import { V2_ENDPOINTS, factoryMismatch, factorySegments } from './analyticsV2KeyContract'

function seededKeys(): readonly unknown[][] {
  const qc = new QueryClient()
  seedDemoCache(qc)
  return qc
    .getQueryCache()
    .getAll()
    .map((query) => query.queryKey as unknown[])
}

/**
 * The exact literal keys the seed used to write, as a fixture for the detector.
 *
 * Still too short for their factory: each of these omits a param the request
 * genuinely carries, so a seed written at this shape is unreachable.
 */
const HISTORICAL_STALE_KEYS: readonly unknown[][] = [
  ['analyticsV2', 'monthly-summaries'],
  ['analyticsV2', 'recurring-transactions', undefined, undefined],
  ['analyticsV2', 'recurring-transactions', true, 0],
  ['analyticsV2', 'net-worth'],
  ['analyticsV2', 'anomalies', undefined, undefined, undefined],
  ['analyticsV2', 'anomalies', undefined, undefined, false],
  ['analyticsV2', 'merchant-intelligence', undefined, undefined],
]

/**
 * The rest of the historical set -- now CANONICAL, and deliberately kept as a
 * fixture rather than deleted.
 *
 * These three were only ever "stale" because the key factory over-declared
 * params the FastAPI handlers never accepted (`offset` everywhere, plus
 * `subcategory` on category-trends and `limit` on transfer-flows). The factory
 * dropped them to match the service, so the short literal is now the correct
 * shape and the detector must accept it. Asserting that keeps the two fixtures
 * honest: a key cannot sit in both, and re-widening the factory would move these
 * back and fail here.
 */
const NOW_CANONICAL_KEYS: readonly unknown[][] = [
  ['analyticsV2', 'category-trends', undefined, undefined],
  ['analyticsV2', 'fy-summaries'],
  ['analyticsV2', 'transfer-flows'],
]

afterEach(() => {
  useDemoStore.getState().exitDemo()
})

describe('seedDemoCache query keys', () => {
  it('never seeds an analyticsV2 key that its factory cannot reproduce', () => {
    const v2Keys = seededKeys().filter((key) => key[0] === 'analyticsV2')
    // Guard against the assertion below silently running over an empty set.
    expect(v2Keys.length).toBeGreaterThan(0)
    const drift = v2Keys.map((key) => factoryMismatch(key)).filter((reason): reason is string => reason !== null)
    expect(drift).toEqual([])
  })

  it('seeds the routes the demo interceptor does not answer', () => {
    const hashes = new Set(seededKeys().map((key) => hashKey(key)))
    // These have no DEMO_ROUTES entry, so the seed is the only source of data.
    expect(hashes.has(hashKey(['preferences']))).toBe(true)
    expect(hashes.has(hashKey(['calculations', 'master-categories']))).toBe(true)
  })

  it('seeds the keys that gate first paint', () => {
    const hashes = new Set(seededKeys().map((key) => hashKey(key)))
    // DEMO_ROUTES answers all three, so the seed is not the only data source --
    // it is what keeps the first render off a skeleton. OverviewPage returns
    // <PageSkeleton /> until budgets+goals settle, the sidebar / mobile tab bar /
    // notification-center budget badges start empty, and the ledger is read by
    // most pages on mount.
    expect(hashes.has(hashKey(analyticsV2Keys.budgets({ active_only: true })))).toBe(true)
    expect(hashes.has(hashKey(analyticsV2Keys.goals()))).toBe(true)
    expect(hashes.has(hashKey(['transactions', undefined]))).toBe(true)
  })
})

describe('prefetchCoreData query keys', () => {
  it('warms analyticsV2 keys the hooks can actually read', async () => {
    // Same drift class as the seed, but it costs a real round-trip on every
    // login and every upload, so it gets the same detector pointed at it.
    useDemoStore.getState().enterDemo()
    try {
      prefetchCoreData()
      const drift = queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey as unknown[])
        .filter((key) => key[0] === 'analyticsV2')
      expect(drift.length).toBeGreaterThan(0)
      expect(drift.map(factoryMismatch).filter((reason) => reason !== null)).toEqual([])
    } finally {
      await queryClient.cancelQueries()
      queryClient.clear()
    }
  })
})

describe('factoryMismatch detector', () => {
  it('covers every endpoint the key factory exposes', () => {
    // Without this, adding a factory entry would silently escape the drift
    // check above -- the detector would just never be asked about it.
    const segments = factorySegments()
    expect(segments.length).toBeGreaterThan(0)
    const mapped = V2_ENDPOINTS.map((e) => e.segment)
    expect(segments.filter((segment) => !mapped.includes(segment))).toEqual([])
    expect(mapped.filter((segment) => !segments.includes(segment))).toEqual([])
  })

  it('accepts keys built by the factory', () => {
    const canonical: readonly unknown[][] = [
      [...analyticsV2Keys.monthlySummaries()],
      [...analyticsV2Keys.monthlySummaries({ limit: 12 })],
      [...analyticsV2Keys.transferFlows()],
      [...analyticsV2Keys.fySummaries()],
      [...analyticsV2Keys.recurringTransactions({ active_only: true, min_confidence: 0, pattern_kind: 'commitment' })],
      [...analyticsV2Keys.anomalies({ include_reviewed: false })],
      [...analyticsV2Keys.budgets({ active_only: true })],
      [...analyticsV2Keys.goals({ include_achieved: true })],
      [...analyticsV2Keys.cohortSpending()],
      [...analyticsV2Keys.spendingRule({ start_date: '2026-04-01', end_date: '2026-07-26' })],
    ]
    expect(canonical.map(factoryMismatch)).toEqual(canonical.map(() => null))
  })

  it('rejects every historically stale literal key', () => {
    // Guards against re-adding the old hand-written keys. budgets/goals are
    // absent from the fixture because their literal keys happened to match.
    const rejected = HISTORICAL_STALE_KEYS.filter((key) => factoryMismatch(key) !== null)
    expect(rejected).toHaveLength(HISTORICAL_STALE_KEYS.length)
  })

  it('accepts the three keys the param-drift fix made canonical', () => {
    // The mirror of the assertion above, and the reason these were not simply
    // deleted: if the factory ever re-grows a param its endpoint cannot accept,
    // these keys go short again and this fails.
    expect(NOW_CANONICAL_KEYS.map(factoryMismatch)).toEqual(NOW_CANONICAL_KEYS.map(() => null))
  })

  it('flags a key for an endpoint the factory does not expose', () => {
    expect(factoryMismatch(['analyticsV2', 'not-an-endpoint'])).toContain('unknown analyticsV2 endpoint')
  })
})

describe('demo mode interceptor vs seeds', () => {
  it('serves every analyticsV2 list endpoint from the interceptor', async () => {
    useDemoStore.getState().enterDemo()
    const rows = await Promise.all([
      analyticsV2Service.getMonthlySummaries(),
      analyticsV2Service.getCategoryTrends(),
      analyticsV2Service.getRecurringTransactions({ active_only: true, min_confidence: 0 }),
      analyticsV2Service.getNetWorthSnapshots(),
      analyticsV2Service.getFYSummaries(),
      analyticsV2Service.getAnomalies({ include_reviewed: false }),
      analyticsV2Service.getBudgets({ active_only: true }),
      analyticsV2Service.getGoals({ include_achieved: true }),
      analyticsV2Service.getTransferFlows(),
      analyticsV2Service.getMerchantIntelligence(),
      analyticsV2Service.getDailySummaries(),
      analyticsV2Service.getInvestmentHoldings(),
    ])
    expect(rows).toHaveLength(12)
    for (const list of rows) {
      expect(Array.isArray(list)).toBe(true)
      expect(list.length).toBeGreaterThan(0)
    }
  })

  it('honours filter params the seeds could never have covered', async () => {
    useDemoStore.getState().enterDemo()
    const commitments = await analyticsV2Service.getRecurringTransactions({
      active_only: true,
      pattern_kind: 'commitment',
    })
    const habits = await analyticsV2Service.getRecurringTransactions({ pattern_kind: 'habit' })
    expect(commitments.length).toBeGreaterThan(0)
    expect(commitments.every((row) => row.pattern_kind === 'commitment' && row.is_active)).toBe(true)
    expect(habits.every((row) => row.pattern_kind === 'habit')).toBe(true)

    const unreviewed = await analyticsV2Service.getAnomalies({ include_reviewed: false })
    expect(unreviewed.every((row) => !row.is_reviewed)).toBe(true)
  })

  it('returns nothing for the routes only the seed can answer', async () => {
    useDemoStore.getState().enterDemo()
    // Proves the two assertions above are not tautological: the interceptor has
    // no entry for these, which is why seedDemoCache must keep seeding them.
    await expect(preferencesService.getPreferences()).resolves.toEqual([])
    await expect(calculationsApi.getMasterCategories()).resolves.toMatchObject({ data: [] })
  })

  it('serves the seeded budgets/goals keys without a pending first render', async () => {
    useDemoStore.getState().enterDemo()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    seedDemoCache(qc)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )

    const budgets = renderHook(() => useBudgets({ active_only: true }), { wrapper })
    const goals = renderHook(() => useGoals(), { wrapper })
    // Not `waitFor`: the point is that the seed is already there on mount, which
    // is what keeps OverviewPage off <PageSkeleton /> and the badges non-empty.
    expect(budgets.result.current.isPending).toBe(false)
    expect(goals.result.current.isPending).toBe(false)
    expect(budgets.result.current.data?.length).toBeGreaterThan(0)
    expect(goals.result.current.data?.length).toBeGreaterThan(0)
  })

  it('lands hook data under the factory key that the old seed missed', async () => {
    useDemoStore.getState().enterDemo()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    seedDemoCache(qc)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )

    const params = { active_only: true, min_confidence: 0, pattern_kind: 'commitment' }
    const { result } = renderHook(() => useRecurringTransactions(params), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.length).toBeGreaterThan(0)
    // The data must be reachable at the factory key -- the exact invariant the
    // 2-element `['analyticsV2','recurring-transactions']` seed violated.
    expect(qc.getQueryData(analyticsV2Keys.recurringTransactions(params))).toEqual(result.current.data)
  })
})

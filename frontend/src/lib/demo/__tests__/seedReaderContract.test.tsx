/**
 * Every key `seedDemoCache` writes must be a key a real hook actually reads.
 *
 * `staleTime` is Infinity, so a seeded key that differs from the reading hook's
 * key by even one element is written to a slot nothing ever consults: the
 * generator work is paid for and thrown away, and the page still goes to the
 * network. The sibling `seedDemoCache.test.tsx` pins the analyticsV2 contract
 * and the three first-paint keys; this file closes the general case in both
 * directions, which is how four dead seeds (`category-breakdown` with no
 * params, `kpis`, `analytics/overview`, `analytics/behavior`) survived.
 *
 * Two layers, because either alone is escapable:
 *
 * 1. `READERS` mounts the hook the way the app calls it and asserts the seed
 *    satisfies it on the FIRST render. If the key drifts, `data` is undefined at
 *    mount and the assertion fails. This catches a key changing shape.
 * 2. `hookCallForms` scans the app's own source text for every distinct way each
 *    seeded hook is invoked, and asserts `READERS` covers all of them. Without
 *    this, `READERS` is itself a hand-maintained list -- of invocations rather
 *    than keys -- and rots exactly the way the four dead seeds rotted. A real
 *    call site gaining a param (e.g. `useGoals()` -> `useGoals({ ... })`) now
 *    fails here even though the seed was not touched.
 */

import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider, hashKey } from '@tanstack/react-query'

import {
  useAccountBalances,
  useBehavior,
  useCategoryBreakdown,
  useKPIs,
  useMasterCategories,
  useMonthlyAggregation,
  useOverview,
  useRecentTransactions,
  useTotals,
  useTrends,
} from '@/hooks/api/useAnalytics'
import { useBudgets, useGoals } from '@/hooks/api/useAnalyticsV2'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useTransactions } from '@/hooks/api/useTransactions'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { DEMO_TOKENS, DEMO_USER } from '../enterDemoMode'
import { seedDemoCache } from '../seedDemoCache'
import { hookCallForms, isTestPath } from './sourceScan'

/**
 * A hook call exactly as the app makes it, paired with the label used in
 * failure output. `use` returns the query's `data`, so a drifted key shows up
 * as `undefined` on the first render.
 *
 * `form` is the invocation as it appears in source, whitespace-collapsed. It is
 * matched against the real call sites by `covers every way the app calls a
 * seeded hook`, so this array cannot silently fall behind them.
 */
interface Reader {
  readonly form: string
  readonly use: () => unknown
}

/** Hooks whose reads the seed is responsible for. Drives the source scan. */
const SEEDED_HOOKS: readonly string[] = [
  'usePreferences',
  'useTransactions',
  'useRecentTransactions',
  'useTotals',
  'useMonthlyAggregation',
  'useAccountBalances',
  'useMasterCategories',
  'useTrends',
  'useBudgets',
  'useGoals',
]

/**
 * Call forms the seed deliberately does not cover, each with the reason.
 *
 * A seed only makes sense for a form the app calls with STABLE arguments. These
 * take a runtime date window or params object, so there is no fixed key to seed
 * and DEMO_ROUTES answers them instead. Listing them here (rather than leaving
 * them unmatched) means a NEW uncovered form still fails the contract.
 */
const UNSEEDABLE_FORMS: readonly string[] = [
  // Date-window driven -- key varies with the user's time filter.
  'useTotals(dateRange)',
  'useMonthlyAggregation(dateRange)',
  'useAccountBalances(dateParams)',
  // Goals page asks for achieved goals too; Overview asks for the default set.
  // Both are served by DEMO_ROUTES; only the Overview form gates first paint.
  'useGoals({ include_achieved: true })',
]

/**
 * Readers for every seed. `form` must match a real call site verbatim.
 */
const READERS: readonly Reader[] = [
  // No DEMO_ROUTES entry at all, so this seed is the only source of preference
  // data in demo mode -- a drift here empties the app, not just slows it.
  { form: 'usePreferences()', use: () => usePreferences().data },
  // `useTransactions()` with no filters -- 15 call sites incl. useDashboardMetrics.
  { form: 'useTransactions()', use: () => useTransactions().data },
  // useDashboardMetrics.ts keeps this warm for other pages.
  { form: 'useRecentTransactions(5)', use: () => useRecentTransactions(5).data },
  // FIRECalculatorPage / useGoalsState call these with no args.
  { form: 'useTotals()', use: () => useTotals().data },
  { form: 'useMonthlyAggregation()', use: () => useMonthlyAggregation().data },
  { form: 'useAccountBalances()', use: () => useAccountBalances().data },
  // useSettingsState.ts
  { form: 'useMasterCategories()', use: () => useMasterCategories().data },
  // useTrendsForecasts.ts
  { form: "useTrends('all_time')", use: () => useTrends('all_time').data },
  // Sidebar / mobile tab bar / notification-center badges, and OverviewPage.
  { form: 'useBudgets({ active_only: true })', use: () => useBudgets({ active_only: true }).data },
  { form: 'useGoals()', use: () => useGoals().data },
]

/**
 * `seedDemoCache` names several hooks in its comments without reading them, and
 * this file names all of them. Neither is a call site.
 */
function isNotACallSite(path: string): boolean {
  return isTestPath(path) || path === '/src/lib/demo/seedDemoCache.ts'
}

function seededClient(): QueryClient {
  // `retry: false` so a drifted key fails fast instead of retrying a request
  // that jsdom has no server for. staleTime mirrors the app's queryClient.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  seedDemoCache(qc)
  return qc
}

function seededHashes(qc: QueryClient): Set<string> {
  return new Set(
    qc
      .getQueryCache()
      .getAll()
      .map((query) => hashKey(query.queryKey)),
  )
}

/** Every key some reader's hook actually subscribed to, read off the observer. */
function claimedHashes(): Set<string> {
  const claimed = new Set<string>()
  for (const { use } of READERS) {
    const qc = seededClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    renderHook(use, { wrapper })
    // Taken from the observer rather than re-derived, so this cannot drift from
    // the hook either.
    for (const query of qc.getQueryCache().getAll()) {
      if (query.observers.length > 0) claimed.add(hashKey(query.queryKey))
    }
  }
  return claimed
}

afterEach(() => {
  useDemoStore.getState().exitDemo()
  useAuthStore.getState().logout()
})

describe('seedDemoCache reader contract', () => {
  it('covers every way the app calls a seeded hook', async () => {
    // The layer that makes READERS non-vacuous. A product edit to a real call
    // site -- `useGoals()` -> `useGoals({ include_achieved: true })` at
    // pages/OverviewPage.tsx -- fails here without anyone touching the seed.
    const forms = await hookCallForms(SEEDED_HOOKS, isNotACallSite)
    expect(forms.length).toBeGreaterThan(0)

    const accounted = new Set([...READERS.map((r) => r.form), ...UNSEEDABLE_FORMS])
    const unaccounted = forms
      .filter(({ form }) => !accounted.has(form))
      .map(({ form, paths }) => `${form} at ${paths.join(', ')}`)
    expect(unaccounted).toEqual([])

    // And the reverse: a reader whose form no longer exists in the app is a
    // stale transcription, which is how a seed outlives its consumer.
    const real = new Set(forms.map(({ form }) => form))
    expect(READERS.map((r) => r.form).filter((form) => !real.has(form))).toEqual([])
    expect(UNSEEDABLE_FORMS.filter((form) => !real.has(form))).toEqual([])
  })

  it('satisfies every reader on the first render', () => {
    // Not `waitFor`: resolving later would mean the hook went to the network,
    // which is exactly the failure this guards. One client per reader so a
    // fetch triggered by one drifted key cannot backfill another's slot.
    // `usePreferences` gates on an access token, so demo auth is set up first --
    // reusing the app's own demo identity rather than a second fixture.
    useAuthStore.getState().login({ ...DEMO_USER }, { ...DEMO_TOKENS })
    const missed = READERS.filter(({ use }) => {
      const qc = seededClient()
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      )
      const { result } = renderHook(use, { wrapper })
      return result.current === undefined
    }).map(({ form }) => form)

    expect(missed).toEqual([])
  })

  it('writes no key that no reader claims', () => {
    // The reverse direction. Without this, a new seed on a mistyped key -- the
    // four that already rotted -- passes every other test in the suite. Every
    // seed is covered by a mounted reader, including `preferences`: there is no
    // hardcoded-hash escape hatch left.
    const claimed = claimedHashes()
    const orphans = [...seededHashes(seededClient())].filter((hash) => !claimed.has(hash))
    expect(orphans).toEqual([])
  })

  it('does not seed the param-less category-breakdown slot', () => {
    // All six `useCategoryBreakdown` call sites pass a `transaction_type`, so
    // the param-less key is unreachable. DEMO_ROUTES answers the real requests.
    const hashes = seededHashes(seededClient())
    expect(hashes.has(hashKey(['calculations', 'category-breakdown', undefined]))).toBe(false)
    expect(hashes.has(hashKey(['calculations', 'category-breakdown', { transaction_type: 'expense' }]))).toBe(false)
  })

  it('does not seed the v1 endpoints that lost their consumers', () => {
    const hashes = seededHashes(seededClient())
    expect(hashes.has(hashKey(['kpis', undefined]))).toBe(false)
    expect(hashes.has(hashKey(['analytics', 'overview', 'all_time']))).toBe(false)
    expect(hashes.has(hashKey(['analytics', 'behavior', 'all_time']))).toBe(false)
  })

  it('keeps the consumerless v1 hooks unmounted-but-serviceable', () => {
    // If someone wires `useKPIs` / `useOverview` / `useBehavior` into a page,
    // removing their seeds must not have broken them -- DEMO_ROUTES still
    // answers, so the hooks resolve, just not synchronously. Asserting they are
    // pending (not errored) at mount documents the tradeoff the removal made.
    useDemoStore.getState().enterDemo()
    const qc = seededClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    // Narrowed to the two fields under assertion so the three differently-typed
    // query results share one signature -- `renderHook` otherwise unifies the
    // callbacks against whichever data type comes first in the array.
    const consumerless: ReadonlyArray<() => { isError: boolean; data: unknown }> = [
      () => useKPIs(),
      () => useOverview(),
      () => useBehavior(),
    ]
    for (const use of consumerless) {
      const { result } = renderHook(use, { wrapper })
      expect(result.current.isError).toBe(false)
      expect(result.current.data).toBeUndefined()
    }
  })

  it('serves the dropped seeds from the demo interceptor instead', async () => {
    // The removals are only safe because these paths have DEMO_ROUTES entries.
    useDemoStore.getState().enterDemo()
    const qc = seededClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCategoryBreakdown({ transaction_type: 'expense' }), { wrapper })
    // This one legitimately awaits: it proves the interceptor, not the seed.
    await expect.poll(() => result.current.data?.categories).toBeDefined()
    expect(Object.keys(result.current.data?.categories ?? {}).length).toBeGreaterThan(0)
  })
})

/**
 * `useStablePeriodData` is what keeps a multi-read analytics page on ONE
 * period while the next one loads. The failure it exists to prevent is a
 * render that shows two windows at once: one read's new key already cached
 * (it resolves immediately) beside another read still holding the previous
 * key's placeholder. Every test below drives real TanStack queries with
 * `keepPreviousData`, the configuration the pages use, and records EVERY
 * render, so a single mixed frame fails the run rather than only the last one.
 */

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider, keepPreviousData, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useStablePeriodData, type PeriodRead } from '../useStablePeriodData'

/** Each response names the period it was fetched for, so a mix is visible. */
interface Reading {
  readonly period: string
  readonly value: number
}

interface Deferred {
  readonly promise: Promise<Reading>
  resolve: (reading: Reading) => void
  reject: (error: Error) => void
}

function deferred(): Deferred {
  let resolve: (reading: Reading) => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  const promise = new Promise<Reading>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let client: QueryClient
/** Pending responses by `${read}:${period}`, settled by each test. */
let pending: Map<string, Deferred>

function respond(key: string) {
  const entry = deferred()
  pending.set(key, entry)
  return entry.promise
}

function settle(key: string, value: number) {
  const entry = pending.get(key)
  if (!entry) throw new Error(`no request in flight for ${key}`)
  const period = key.split(':')[1]
  entry.resolve({ period, value })
}

function useRead(name: string, period: string, enabled = true) {
  return useQuery({
    queryKey: [name, period],
    queryFn: () => respond(`${name}:${period}`),
    staleTime: Infinity,
    retry: false,
    enabled,
    placeholderData: keepPreviousData,
  })
}

interface Frame {
  readonly period: string
  readonly totals: Reading | undefined
  readonly categories: Reading | undefined
  readonly isSettling: boolean
  readonly isInitialLoad: boolean
}

/** Two period-keyed reads, the smallest page shape that can mix. */
function usePage(period: string, frames: Frame[]) {
  const totals = useRead('totals', period)
  const categories = useRead('categories', period)
  const stable = useStablePeriodData(period, [totals, categories])
  const [shownTotals, shownCategories] = stable.data
  frames.push({
    period: stable.period,
    totals: shownTotals,
    categories: shownCategories,
    isSettling: stable.isSettling,
    isInitialLoad: stable.isInitialLoad,
  })
  return { stable, totals, categories }
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** A frame is consistent when every read it shows was fetched for its period. */
function expectConsistent(frames: readonly Frame[]) {
  for (const frame of frames) {
    if (frame.isInitialLoad) continue
    expect(frame.totals?.period ?? frame.period).toBe(frame.period)
    expect(frame.categories?.period ?? frame.period).toBe(frame.period)
  }
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  pending = new Map()
})

afterEach(() => {
  client.clear()
})

describe('useStablePeriodData', () => {
  it('reports the first load until every read has data, then commits', async () => {
    const frames: Frame[] = []
    const { result } = renderHook(() => usePage('2025', frames), { wrapper })

    expect(result.current.stable.isInitialLoad).toBe(true)
    expect(result.current.stable.isSettling).toBe(false)

    act(() => settle('totals:2025', 100))
    await waitFor(() => expect(result.current.totals.data).toBeDefined())
    // One read in is still a first load: the page keeps its skeleton.
    expect(result.current.stable.isInitialLoad).toBe(true)

    act(() => settle('categories:2025', 7))
    await waitFor(() => expect(result.current.stable.isInitialLoad).toBe(false))
    expect(result.current.stable.period).toBe('2025')
    expect(result.current.stable.data).toEqual([
      { period: '2025', value: 100 },
      { period: '2025', value: 7 },
    ])
  })

  it('holds the previous snapshot while one read is cached and the other pending', async () => {
    const frames: Frame[] = []
    const { result, rerender } = renderHook(({ period }) => usePage(period, frames), {
      wrapper,
      initialProps: { period: '2025' },
    })
    act(() => {
      settle('totals:2025', 100)
      settle('categories:2025', 7)
    })
    await waitFor(() => expect(result.current.stable.isInitialLoad).toBe(false))

    // 2026's totals are already cached (another page read them), so that read
    // resolves the moment the key changes -- the case that used to mix.
    client.setQueryData(['totals', '2026'], { period: '2026', value: 250 })
    rerender({ period: '2026' })

    expect(result.current.totals.data).toEqual({ period: '2026', value: 250 })
    expect(result.current.categories.isPlaceholderData).toBe(true)
    expect(result.current.stable.isSettling).toBe(true)
    expect(result.current.stable.period).toBe('2025')
    expect(result.current.stable.data).toEqual([
      { period: '2025', value: 100 },
      { period: '2025', value: 7 },
    ])

    act(() => settle('categories:2026', 9))
    await waitFor(() => expect(result.current.stable.isSettling).toBe(false))
    expect(result.current.stable.period).toBe('2026')
    expect(result.current.stable.data).toEqual([
      { period: '2026', value: 250 },
      { period: '2026', value: 9 },
    ])
    expectConsistent(frames)
  })

  it('never renders a mixed frame across a rapid period change', async () => {
    const frames: Frame[] = []
    const { result, rerender } = renderHook(({ period }) => usePage(period, frames), {
      wrapper,
      initialProps: { period: 'A' },
    })
    act(() => {
      settle('totals:A', 1)
      settle('categories:A', 2)
    })
    await waitFor(() => expect(result.current.stable.isInitialLoad).toBe(false))

    rerender({ period: 'B' })
    // B's totals land, then the reader moves on to C before B completes.
    act(() => settle('totals:B', 3))
    await waitFor(() => expect(result.current.totals.isPlaceholderData).toBe(false))
    rerender({ period: 'C' })
    act(() => settle('categories:B', 4))
    act(() => settle('categories:C', 6))
    await waitFor(() => expect(result.current.categories.data?.period).toBe('C'))
    expect(result.current.stable.period).toBe('A')
    act(() => settle('totals:C', 5))

    await waitFor(() => expect(result.current.stable.period).toBe('C'))
    expect(result.current.stable.data).toEqual([
      { period: 'C', value: 5 },
      { period: 'C', value: 6 },
    ])
    // B never committed: its reads finished only after C was selected.
    expect(frames.some((frame) => frame.period === 'B')).toBe(false)
    expectConsistent(frames)
  })

  it('commits a fully cached period in the same render, with no settling frame', async () => {
    const frames: Frame[] = []
    const { result, rerender } = renderHook(({ period }) => usePage(period, frames), {
      wrapper,
      initialProps: { period: '2025' },
    })
    act(() => {
      settle('totals:2025', 100)
      settle('categories:2025', 7)
    })
    await waitFor(() => expect(result.current.stable.isInitialLoad).toBe(false))

    client.setQueryData(['totals', '2024'], { period: '2024', value: 80 })
    client.setQueryData(['categories', '2024'], { period: '2024', value: 5 })
    const before = frames.length
    rerender({ period: '2024' })

    expect(result.current.stable.period).toBe('2024')
    expect(frames.slice(before).every((frame) => !frame.isSettling)).toBe(true)
    expectConsistent(frames)
  })

  it('lets a failed read settle so the page can show its error state', async () => {
    const frames: Frame[] = []
    const { result, rerender } = renderHook(({ period }) => usePage(period, frames), {
      wrapper,
      initialProps: { period: '2025' },
    })
    act(() => {
      settle('totals:2025', 100)
      settle('categories:2025', 7)
    })
    await waitFor(() => expect(result.current.stable.isInitialLoad).toBe(false))

    rerender({ period: '2026' })
    act(() => settle('totals:2026', 250))
    act(() => pending.get('categories:2026')?.reject(new Error('offline')))

    await waitFor(() => expect(result.current.categories.isError).toBe(true))
    // Not pinned on 2025: the failed read is settled, its data is absent, and
    // the page's isError branch (with retry) takes over.
    expect(result.current.stable.isSettling).toBe(false)
    expect(result.current.stable.period).toBe('2026')
    expect(result.current.stable.data).toEqual([{ period: '2026', value: 250 }, undefined])
    expectConsistent(frames)
  })

  it('does not wait on a read passed as null', () => {
    const read: PeriodRead<number> = { data: 4, isPlaceholderData: false }
    const { result } = renderHook(() => useStablePeriodData('2025', [read, null]))
    expect(result.current.isInitialLoad).toBe(false)
    expect(result.current.data).toEqual([4, undefined])
  })

  it('does not loop on a read whose data is rebuilt every render', () => {
    let renders = 0
    const { result, rerender } = renderHook(({ period }) => {
      renders += 1
      return useStablePeriodData(period, [{ data: { period }, isPlaceholderData: false }])
    }, { initialProps: { period: '2025' } })
    rerender({ period: '2026' })
    expect(result.current.period).toBe('2026')
    // Mount + one commit per period, not one per render.
    expect(renders).toBeLessThan(6)
  })

  it('replaces the snapshot when the same period refetches', async () => {
    const frames: Frame[] = []
    const { result, rerender } = renderHook(({ period }) => usePage(period, frames), {
      wrapper,
      initialProps: { period: '2025' },
    })
    act(() => {
      settle('totals:2025', 100)
      settle('categories:2025', 7)
    })
    await waitFor(() => expect(result.current.stable.isInitialLoad).toBe(false))

    // An upload refreshes 2025 in place, then the reader moves to 2026.
    act(() => {
      client.setQueryData(['totals', '2025'], { period: '2025', value: 120 }, { updatedAt: Date.now() + 1_000 })
    })
    await waitFor(() => expect(result.current.stable.data[0]?.value).toBe(120))
    rerender({ period: '2026' })
    expect(result.current.stable.isSettling).toBe(true)
    expect(result.current.stable.data[0]).toEqual({ period: '2025', value: 120 })
  })
})

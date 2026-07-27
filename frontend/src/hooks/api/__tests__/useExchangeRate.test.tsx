/**
 * Guards the rate-freshness defect found on 2026-07-27.
 *
 * `/api/exchange-rates` answers in three variants: a live fetch, a stale cache
 * (`stale: true`, `fetched_at` from the last success), and a hardcoded fallback
 * (`fallback: true`, `fetched_at: null`, plus `fallback_as_of` -- the date the
 * baked-in table was captured, currently months in the past).
 *
 * `fallback_as_of` was missing from the response interface, so nothing read it
 * and the hook fell through to `new Date()`. The sidebar therefore reported an
 * approximate months-old table as "just now", and a user converting their whole
 * ledger to USD had no signal that the numbers rested on stale rates.
 *
 * The reference date is injected via fake timers so these assertions hold on any
 * day of the year.
 */

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ExchangeRatesResponse } from '@/services/api/preferences'

const getExchangeRates = vi.fn<() => Promise<ExchangeRatesResponse>>()

vi.mock('@/services/api/preferences', () => ({
  preferencesService: {
    getExchangeRates: () => getExchangeRates(),
  },
}))

const { useExchangeRate } = await import('../useExchangeRate')
const { usePreferencesStore } = await import('@/store/preferencesStore')
const { useAuthStore } = await import('@/store/authStore')

const NOW = new Date('2026-07-27T12:00:00.000Z')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  getExchangeRates.mockReset()
  // The hook is gated on `accessToken` and on a non-base display currency.
  useAuthStore.setState({ accessToken: 'test-token' })
  usePreferencesStore.setState({
    displayCurrency: 'USD',
    exchangeRate: null,
    exchangeRateUpdatedAt: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useExchangeRate freshness', () => {
  it('reports the capture date of a hardcoded fallback table, not now', async () => {
    getExchangeRates.mockResolvedValue({
      base: 'INR',
      rates: { USD: 0.0116 },
      fetched_at: null,
      fallback: true,
      fallback_as_of: '2026-05-13',
    })

    const { result } = renderHook(() => useExchangeRate(), { wrapper })

    await waitFor(() => expect(result.current.rate).toBe(0.0116))
    expect(result.current.isFallback).toBe(true)
    // The whole point: 2026-05-13, not 2026-07-27.
    expect(result.current.updatedAt).toBe(new Date('2026-05-13').toISOString())
    expect(usePreferencesStore.getState().exchangeRateUpdatedAt).toBe(
      new Date('2026-05-13').toISOString(),
    )
  })

  it('uses fetched_at when the upstream fetch succeeded', async () => {
    const fetchedAt = Date.UTC(2026, 6, 27, 9, 30) / 1000
    getExchangeRates.mockResolvedValue({
      base: 'INR',
      rates: { USD: 0.0118 },
      fetched_at: fetchedAt,
    })

    const { result } = renderHook(() => useExchangeRate(), { wrapper })

    await waitFor(() => expect(result.current.rate).toBe(0.0118))
    expect(result.current.isFallback).toBe(false)
    expect(result.current.updatedAt).toBe(new Date(fetchedAt * 1000).toISOString())
  })

  it('keeps the last successful fetch time when serving a stale cache', async () => {
    const fetchedAt = Date.UTC(2026, 6, 20, 8, 0) / 1000
    getExchangeRates.mockResolvedValue({
      base: 'INR',
      rates: { USD: 0.0117 },
      fetched_at: fetchedAt,
      stale: true,
    })

    const { result } = renderHook(() => useExchangeRate(), { wrapper })

    await waitFor(() => expect(result.current.rate).toBe(0.0117))
    expect(result.current.isStale).toBe(true)
    expect(result.current.updatedAt).toBe(new Date(fetchedAt * 1000).toISOString())
  })
})

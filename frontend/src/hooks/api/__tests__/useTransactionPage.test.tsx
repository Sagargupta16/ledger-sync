import type { ReactNode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTransactionPage } from '../useTransactionPage'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<(
    url: string, config: { params: Record<string, unknown>; signal?: AbortSignal },
  ) => Promise<{ data: unknown }>>(),
}))
vi.mock('@/services/api/client', () => ({ apiClient: { get: mockGet } }))

const filters = { sort: 'date', sort_order: 'desc' as const, limit: 10, offset: 0 }
const page = (offset: number, next_cursor: string | null = `after-${offset}`) => ({
  data: [], total: 100, limit: 10, offset, has_more: true, next_cursor,
})
let client: QueryClient

function renderPage(initialProps: Parameters<typeof useTransactionPage>[0] = filters) {
  return renderHook(useTransactionPage, {
    initialProps,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  mockGet.mockReset()
})
afterEach(() => { cleanup(); client.clear() })

describe('numbered transaction page queries', () => {
  it.each(['asc', 'desc'] as const)('uses %s date cursors for next and cached data for previous', async (order) => {
    const first = { ...filters, sort_order: order }
    mockGet.mockResolvedValueOnce({ data: page(0) }).mockResolvedValueOnce({ data: page(10) })
    const view = renderPage(first)
    await waitFor(() => expect(view.result.current.data?.offset).toBe(0))
    view.rerender({ ...first, offset: 10 })
    await waitFor(() => expect(view.result.current.data?.offset).toBe(10))
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api/transactions/search', {
      params: { sort_by: 'date', sort_order: order, limit: 10, cursor: 'after-0' },
      signal: expect.any(AbortSignal) as AbortSignal,
    })
    view.rerender(first)
    await waitFor(() => expect(view.result.current.data?.offset).toBe(0))
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it.each([
    { ...filters, offset: 30 },
    { ...filters, offset: 10, category: 'Food' },
    { ...filters, offset: 10, sort: 'amount' },
    { ...filters, offset: 10, sort_order: 'asc' as const },
    { ...filters, offset: 25, limit: 25 },
  ])('uses offset when the cached page has a different context: %j', async (next) => {
    client.setQueryData(['transactions-page', filters], page(0))
    mockGet.mockResolvedValue({ data: { ...page(next.offset), limit: next.limit } })
    const view = renderPage(next)
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true))
    const { sort, ...rest } = next
    expect(mockGet).toHaveBeenCalledExactlyOnceWith('/api/transactions/search', {
      params: { ...rest, sort_by: sort }, signal: expect.any(AbortSignal) as AbortSignal,
    })
  })

  it('does not reuse invalidated cursors after mutations, even when refetching a later page', async () => {
    client.setQueryData(['transactions-page', filters], page(0))
    mockGet.mockResolvedValueOnce({ data: page(10) }).mockResolvedValue({ data: page(10, 'new') })
    const view = renderPage({ ...filters, offset: 10 })
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true))
    await act(() => client.invalidateQueries({ queryKey: ['transactions-page'] }))
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api/transactions/search', {
      params: { sort_by: 'date', sort_order: 'desc', limit: 10, offset: 10 },
      signal: expect.any(AbortSignal) as AbortSignal,
    })
    // An inactive predecessor remains invalidated until it is fetched again.
    expect(client.getQueryState(['transactions-page', filters])?.isInvalidated).toBe(true)
  })

  it('falls back to offset for old servers/demo responses without a cursor', async () => {
    client.setQueryData(['transactions-page', filters], page(0, null))
    mockGet.mockResolvedValue({ data: page(10) })
    const view = renderPage({ ...filters, offset: 10 })
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true))
    expect(mockGet.mock.calls[0][1].params).toMatchObject({ offset: 10 })
    expect(mockGet.mock.calls[0][1].params).not.toHaveProperty('cursor')
  })

  it('recovers from cursor rejection once, but surfaces other errors', async () => {
    client.setQueryData(['transactions-page', filters], page(0))
    mockGet.mockRejectedValueOnce({ isAxiosError: true, response: { status: 422 } })
      .mockResolvedValueOnce({ data: page(10) })
    const view = renderPage({ ...filters, offset: 10 })
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true))
    expect(mockGet.mock.calls[1][1].params).toMatchObject({ offset: 10 })
    expect(mockGet).toHaveBeenCalledTimes(2)
    view.unmount()
    client.clear()
    client.setQueryData(['transactions-page', filters], page(0))
    mockGet.mockReset().mockRejectedValue({ isAxiosError: true, response: { status: 500 } })
    const failed = renderPage({ ...filters, offset: 10 })
    await waitFor(() => expect(failed.result.current.isError).toBe(true))
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('aborts a pending request when query caches are cleared for upload or session changes', async () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderPage()
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))
    const signal = mockGet.mock.calls[0][1].signal as AbortSignal
    act(() => client.clear())
    expect(signal.aborted).toBe(true)
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })
})

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'

import TransactionsPage from '../TransactionsPage'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<(
    url: string, config?: { params: { offset?: number; cursor?: string } },
  ) => Promise<{ data: unknown }>>(),
}))
vi.mock('@/services/api/client', () => ({ apiClient: { get: mockGet } }))
vi.mock('@/components/transactions/TransactionFilters', () => ({ default: () => null }))
vi.mock('@/components/transactions/SavedViewsMenu', () => ({ default: () => null }))
vi.mock('@/components/transactions/TransactionTable', () => ({ default: () => <div>Ledger rows</div> }))

afterEach(cleanup)

it('the real numbered pagination sends a cursor on Next and an offset on an uncached jump', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  mockGet.mockImplementation((url: string, config?: { params: { offset?: number; cursor?: string } }) => {
    if (url.endsWith('/facets')) return Promise.resolve({ data: {
      categories: [], accounts: [], tags: [], income_count: 0, expense_count: 100,
      transfer_count: 0, total_count: 100,
    } })
    const offset = config?.params.cursor === 'first-cursor' ? 10 : (config?.params.offset ?? 0)
    return Promise.resolve({ data: {
      data: [], total: 100, offset, limit: 10, has_more: true, next_cursor: 'first-cursor',
    } })
  })
  const view = render(<QueryClientProvider client={client}><TransactionsPage /></QueryClientProvider>)
  await screen.findByRole('button', { name: 'Next page' })
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page'))
  fireEvent.click(screen.getByRole('button', { name: '5' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '5' })).toHaveAttribute('aria-current', 'page'))
  const requests = mockGet.mock.calls.filter(([url]) => url === '/api/transactions/search')
  expect(requests).toHaveLength(3)
  expect(requests[0][1]?.params).toMatchObject({ offset: 0, limit: 10, sort_by: 'date', sort_order: 'desc' })
  expect(requests[1][1]?.params).toMatchObject({ cursor: 'first-cursor', limit: 10, sort_by: 'date' })
  expect(requests[1][1]?.params).not.toHaveProperty('offset')
  expect(requests[2][1]?.params).toMatchObject({ offset: 40, limit: 10 })
  expect(requests[2][1]?.params).not.toHaveProperty('cursor')
  view.unmount()
  client.clear()
})

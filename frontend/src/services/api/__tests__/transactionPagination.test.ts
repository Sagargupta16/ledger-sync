import { beforeEach, describe, expect, it, vi } from 'vitest'

import { transactionsService } from '../transactions'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))
vi.mock('../client', () => ({ apiClient: { get: mockGet } }))

describe('transaction pagination request contract', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes a date continuation and preserves the existing response fields', async () => {
    const page = {
      data: [], total: 42, limit: 5, offset: 10, has_more: true, next_cursor: 'next-signed-cursor',
    }
    mockGet.mockResolvedValue({ data: page })

    const result = await transactionsService.getTransactionsPaginated({
      cursor: 'signed-cursor', sort: 'date', sort_order: 'desc', category: 'Food', limit: 5,
    })

    expect(mockGet).toHaveBeenCalledWith('/api/transactions/search', {
      params: {
        cursor: 'signed-cursor', sort_by: 'date', sort_order: 'desc', category: 'Food', limit: 5,
      },
    })
    expect(result).toEqual(page)
  })

  it('exports the same selected sort and filters as the table', async () => {
    const csv = new Blob(['id,date,amount'])
    mockGet.mockResolvedValue({ data: csv })
    const result = await transactionsService.exportToCSV({
      sort: 'amount', sort_order: 'asc', category: 'Food', query: 'purchase',
    })

    expect(mockGet).toHaveBeenCalledWith('/api/transactions/export', {
      params: { sort_by: 'amount', sort_order: 'asc', category: 'Food', query: 'purchase' },
      responseType: 'blob',
    })
    expect(result).toBe(csv)
  })
})

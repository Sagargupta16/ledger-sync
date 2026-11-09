import { describe, expect, it, vi } from 'vitest'

import { pageStatus, retryFailed, type StatusRead } from '@/lib/queryStatus'

function read(overrides: Partial<StatusRead> = {}): StatusRead {
  return { data: undefined, isError: false, isLoading: false, refetch: vi.fn(() => Promise.resolve()), ...overrides }
}

describe('pageStatus', () => {
  it('is loading while a first fetch runs', () => {
    expect(pageStatus([read({ data: 1 }), read({ isLoading: true })]).kind).toBe('loading')
  })

  it('takes an extra loading signal the reads do not carry', () => {
    expect(pageStatus([read({ data: 1 })], true).kind).toBe('loading')
  })

  it('blocks only when a failed read has nothing to show', () => {
    expect(pageStatus([read({ data: 1 }), read({ isError: true })]).kind).toBe('error')
  })

  it('reports a failure ahead of a sibling still loading', () => {
    expect(pageStatus([read({ isError: true }), read({ isLoading: true })]).kind).toBe('error')
  })

  it('keeps cached data on screen when a refresh fails', () => {
    const status = pageStatus([read({ data: 1 }), read({ data: 2, isError: true })])
    expect(status).toMatchObject({ kind: 'ready', refreshFailed: true })
  })

  it('is ready and current when every read holds data', () => {
    expect(pageStatus([read({ data: 1 }), null, undefined])).toMatchObject({ kind: 'ready', refreshFailed: false })
  })
})

describe('retryFailed', () => {
  it('refetches only the reads that failed', async () => {
    const ok = read({ data: 1 })
    const failed = read({ data: 2, isError: true })
    await retryFailed([ok, failed])
    expect(ok.refetch).not.toHaveBeenCalled()
    expect(failed.refetch).toHaveBeenCalledTimes(1)
  })
})

import type { ReactNode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDeleteView, useSaveView } from '@/hooks/api/useSavedViews'
import { useUpdateTransactionTags } from '@/hooks/api/useTags'
import { useUpload } from '@/hooks/api/useUpload'
import { prefetchCoreData } from '@/lib/prefetch'
import { useDataHealth } from '@/pages/data-health/useDataHealth'
import { savedViewsService } from '@/services/api/savedViews'
import { transactionsService } from '@/services/api/transactions'
import { uploadService } from '@/services/api/upload'
import { useAuthStore } from '@/store/authStore'
import type { UploadResponse, User } from '@/types'

vi.mock('@/services/api/upload', () => ({
  uploadService: { uploadTransactions: vi.fn(), refreshAnalytics: vi.fn() },
}))
vi.mock('@/services/api/savedViews', () => ({
  savedViewsService: { saveView: vi.fn(), deleteView: vi.fn() },
}))
vi.mock('@/services/api/transactions', () => ({
  transactionsService: { updateTransactionTags: vi.fn() },
}))
vi.mock('@/lib/prefetch', () => ({ prefetchCoreData: vi.fn() }))
vi.mock('@/hooks/api/useDataHealthQuery', () => ({
  useDataHealthQuery: () => ({ data: undefined, isPending: false, isError: false }),
}))

const uploadResult: UploadResponse = {
  success: true,
  message: 'Saved synthetic ledger',
  file_name: 'account-701.csv',
  stats: { processed: 1, inserted: 1, updated: 0, deleted: 0, unchanged: 0 },
}
const savedView = {
  id: 12, name: 'Account 701', filters: { account: 'Synthetic bank' },
  created_at: '2026-01-01', updated_at: '2026-01-01',
}

let client: QueryClient

function login(id: number) {
  const user: User = {
    id,
    email: `account-${id}@example.test`,
    full_name: `Account ${id}`,
    auth_provider: 'google',
    is_active: true,
    is_verified: true,
    created_at: '2026-01-01T00:00:00',
    last_login: null,
  }
  useAuthStore.getState().login(user, {
    access_token: `synthetic-access-${id}`,
    refresh_token: `synthetic-refresh-${id}`,
    token_type: 'bearer',
  })
}

function useFinancialMutations() {
  const userId = useAuthStore((state) => state.user?.id)
  const upload = useUpload()
  const tags = useUpdateTransactionTags()
  const saveView = useSaveView()
  const deleteView = useDeleteView()
  const dataHealth = useDataHealth()
  return { userId, upload, tags, saveView, deleteView, dataHealth }
}

function renderMutations() {
  return renderHook(useFinancialMutations, {
    wrapper: ({ children }: Readonly<{ children: ReactNode }>) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

const scenarios = [
  {
    name: 'upload',
    service: uploadService.uploadTransactions,
    run: (hooks: ReturnType<typeof useFinancialMutations>) => hooks.upload.mutateAsync({
      fileName: 'account-701.csv', fileHash: 'a'.repeat(64), rows: [],
    }),
    invalidations: [],
  },
  {
    name: 'tag replacement',
    service: transactionsService.updateTransactionTags,
    run: (hooks: ReturnType<typeof useFinancialMutations>) =>
      hooks.tags.mutateAsync({ transactionId: 'account-701-transaction', tags: ['reviewed'] }),
    invalidations: [['transactions'], ['transactions-page'], ['transaction-facets']],
  },
  {
    name: 'saved view update',
    service: savedViewsService.saveView,
    run: (hooks: ReturnType<typeof useFinancialMutations>) =>
      hooks.saveView.mutateAsync({ name: savedView.name, filters: savedView.filters }),
    invalidations: [['saved-views']],
  },
  {
    name: 'saved view deletion',
    service: savedViewsService.deleteView,
    run: (hooks: ReturnType<typeof useFinancialMutations>) => hooks.deleteView.mutateAsync(12),
    invalidations: [['saved-views']],
  },
]

beforeEach(() => {
  vi.resetAllMocks()
  login(701)
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  vi.mocked(uploadService.uploadTransactions).mockResolvedValue(uploadResult)
  vi.mocked(uploadService.refreshAnalytics).mockResolvedValue()
  vi.mocked(transactionsService.updateTransactionTags).mockResolvedValue({
    transaction_id: 'account-701-transaction', tags: ['reviewed'],
  })
  vi.mocked(savedViewsService.saveView).mockResolvedValue(savedView)
  vi.mocked(savedViewsService.deleteView).mockResolvedValue()
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
})

describe('financial mutation session boundaries', () => {
  it.each(scenarios)('cancels queued $name after an account switch and observer update', async ({ run, service }) => {
    const { result, rerender } = renderMutations()
    let pending: Promise<unknown> | undefined
    act(() => {
      pending = run(result.current).catch((error: unknown) => error)
      login(702)
    })
    rerender()
    await act(async () => { await pending })

    expect(await pending).toMatchObject({ code: 'ERR_CANCELED' })
    expect(service).not.toHaveBeenCalled()
    expect(result.current.userId).toBe(702)
  })

  it.each(scenarios)('does not publish late $name success into the next account', async ({ run, service }) => {
    let release!: () => void
    let received!: () => void
    const responseReceived = new Promise<void>((resolve) => { received = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    client.getMutationCache().config.onSuccess = () => {
      received()
      return released
    }
    const { result } = renderMutations()
    let pending: Promise<unknown> | undefined
    await act(async () => {
      pending = run(result.current)
      await responseReceived
    })
    act(() => login(702))
    client.setQueryData(['account-702'], { owner: 702 })
    const clear = vi.spyOn(client, 'clear')
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await act(async () => {
      release()
      await pending
    })

    expect(service).toHaveBeenCalledOnce()
    expect(clear).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
    expect(prefetchCoreData).not.toHaveBeenCalled()
    expect(client.getQueryData(['account-702'])).toEqual({ owner: 702 })
  })

  it.each(scenarios)('preserves successful $name behavior in the current account', async ({ run, service, invalidations }) => {
    const { result } = renderMutations()
    const clear = vi.spyOn(client, 'clear')
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await act(async () => { await run(result.current) })

    expect(service).toHaveBeenCalledOnce()
    expect(invalidate.mock.calls).toEqual(invalidations.map((queryKey) => [{ queryKey }]))
    if (service === uploadService.uploadTransactions) {
      expect(clear).toHaveBeenCalledOnce()
      expect(prefetchCoreData).toHaveBeenCalledOnce()
    } else {
      expect(clear).not.toHaveBeenCalled()
    }
  })

  it('allows a queued upload after tokens refresh for the same account', async () => {
    const { result } = renderMutations()
    let pending: Promise<unknown> | undefined
    act(() => {
      pending = scenarios[0].run(result.current)
      useAuthStore.getState().setTokens({
        access_token: 'synthetic-refreshed-701',
        refresh_token: 'synthetic-refresh-refreshed-701',
        token_type: 'bearer',
      })
    })
    await act(async () => { await pending })

    expect(await pending).toEqual(uploadResult)
    expect(uploadService.uploadTransactions).toHaveBeenCalledOnce()
  })

  it('cancels an analytics rebuild queued for the previous account', async () => {
    const { result } = renderMutations()
    act(() => result.current.dataHealth.runIssueAction('stale-rollups'))
    const mutation = client.getMutationCache().getAll()[0]
    act(() => login(702))
    await waitFor(() => expect(mutation.state.status).toBe('error'))

    expect(mutation.state.error).toMatchObject({ code: 'ERR_CANCELED' })
    expect(uploadService.refreshAnalytics).not.toHaveBeenCalled()
  })

  it('keeps the next account cache intact after a late analytics rebuild', async () => {
    let resolve!: () => void
    vi.mocked(uploadService.refreshAnalytics).mockReturnValue(
      new Promise<void>((done) => { resolve = done })
    )
    const { result } = renderMutations()
    act(() => result.current.dataHealth.runIssueAction('stale-rollups'))
    const mutation = client.getMutationCache().getAll()[0]
    await waitFor(() => expect(uploadService.refreshAnalytics).toHaveBeenCalledOnce())
    act(() => login(702))
    client.setQueryData(['analyticsV2', 'account-702'], { owner: 702 })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    act(() => resolve())
    await waitFor(() => expect(mutation.state.status).toBe('success'))

    expect(invalidate).not.toHaveBeenCalled()
    expect(client.getQueryState(['analyticsV2', 'account-702'])?.isInvalidated).toBe(false)
  })

  it('refreshes analytics and invalidates rollups in the current account', async () => {
    const { result } = renderMutations()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    act(() => result.current.dataHealth.runIssueAction('stale-rollups'))
    const mutation = client.getMutationCache().getAll()[0]
    await waitFor(() => expect(mutation.state.status).toBe('success'))

    expect(uploadService.refreshAnalytics).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: ['analyticsV2'] })
  })
})

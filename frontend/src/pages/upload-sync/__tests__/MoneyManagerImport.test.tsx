/**
 * Guards the `.mmbak` flow: the browser gzips the backup, a dry run fills the
 * review, and only the confirmed import replaces the ledger. The API module is
 * mocked; `moneyManagerBackup.test.ts` covers the request itself.
 */

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ParseResult } from '@/lib/fileParser'
import { clearSessionData } from '@/lib/session'
import type {
  MoneyManagerImportParams,
  MoneyManagerImportResponse,
} from '@/services/api/moneyManagerBackup'
import type { ImportHistoryResponse } from '@/services/api/upload'

import { toUploadAnalyticsStatus } from '../moneyManagerUtils'
import UploadSyncPage from '../UploadSyncPage'
import { useUploadSync } from '../useUploadSync'
import {
  BACKUP,
  BACKUP_NAME,
  CHANGE_SUMMARY,
  GZIPPED,
  IMPORTED,
  PREVIEW,
} from './moneyManagerFixtures'

const mocks = vi.hoisted(() => ({
  gzipBackup: vi.fn<(file: Blob) => Promise<Blob>>(),
  importBackup: vi.fn<(params: MoneyManagerImportParams) => Promise<MoneyManagerImportResponse>>(),
  parseFile: vi.fn<(file: File) => Promise<ParseResult>>(),
  refreshAnalytics: vi.fn<() => Promise<void>>(),
  getImportHistory: vi.fn<(limit?: number) => Promise<ImportHistoryResponse>>(),
  prefetchCoreData: vi.fn<() => void>(),
  demo: { active: false },
}))

vi.mock('@/services/api/moneyManagerBackup', () => ({
  gzipBackup: mocks.gzipBackup,
  moneyManagerBackupService: { importBackup: mocks.importBackup },
}))
vi.mock('@/services/api/upload', () => ({
  uploadService: {
    refreshAnalytics: mocks.refreshAnalytics,
    getImportHistory: mocks.getImportHistory,
  },
}))
vi.mock('@/lib/fileParser', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/fileParser')>(),
  parseFile: mocks.parseFile,
}))
vi.mock('@/lib/prefetch', () => ({ prefetchCoreData: mocks.prefetchCoreData }))
vi.mock('@/hooks/useDemoGuard', () => ({
  useDemoGuard: () => ({ guardDemoAction: () => mocks.demo.active }),
}))

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const clear = vi.spyOn(client, 'clear')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { clear, wrapper }
}

async function selectBackup() {
  const { clear, wrapper } = setup()
  const { result } = renderHook(() => useUploadSync(), { wrapper })
  await act(() => result.current.handleFileSelect(BACKUP))
  return { clear, result }
}

beforeEach(() => {
  // Reset, not clear: a queued once-value must not leak into the next test.
  vi.resetAllMocks()
  mocks.demo.active = false
  mocks.gzipBackup.mockResolvedValue(GZIPPED)
  mocks.importBackup.mockResolvedValue(PREVIEW)
  mocks.getImportHistory.mockResolvedValue({ imports: [], total_count: 0 })
})

describe('useUploadSync with a Money Manager backup', () => {
  it('checks the compressed backup with a dry run and saves nothing before review', async () => {
    const { clear, result } = await selectBackup()

    expect(mocks.parseFile).not.toHaveBeenCalled()
    expect(mocks.gzipBackup).toHaveBeenCalledWith(BACKUP)
    expect(mocks.importBackup).toHaveBeenCalledOnce()
    expect(mocks.importBackup).toHaveBeenCalledWith({
      fileName: BACKUP_NAME, backup: GZIPPED, dryRun: true, force: false, allowLargeDelete: true,
    })
    expect(result.current.phase).toBe('review')
    expect(result.current.backup.review?.preview).toEqual(PREVIEW)
    expect(clear).not.toHaveBeenCalled()
    expect(mocks.prefetchCoreData).not.toHaveBeenCalled()
  })

  it('imports the reviewed bytes, then clears and rewarms the workspace', async () => {
    mocks.importBackup.mockResolvedValueOnce(PREVIEW).mockResolvedValueOnce(IMPORTED)
    const { clear, result } = await selectBackup()
    await act(() => result.current.backup.confirm())

    expect(mocks.importBackup).toHaveBeenLastCalledWith({
      fileName: BACKUP_NAME, backup: GZIPPED, dryRun: false, force: false, allowLargeDelete: true,
    })
    expect(mocks.gzipBackup).toHaveBeenCalledOnce()
    expect(clear).toHaveBeenCalledOnce()
    expect(mocks.prefetchCoreData).toHaveBeenCalledOnce()
    expect(result.current.backup.review).toBeNull()
    expect(result.current.phase).toBeNull()
    expect(result.current.success).toEqual({
      fileName: BACKUP_NAME, summary: CHANGE_SUMMARY, analyticsStatus: 'ready', analyticsMessage: null,
    })
  })

  it('reports an already imported backup and forces a re-import only after a new review', async () => {
    mocks.importBackup
      .mockResolvedValueOnce({ ...PREVIEW, status: 'unchanged' })
      .mockResolvedValueOnce(PREVIEW)
      .mockResolvedValueOnce(IMPORTED)
    const { result } = await selectBackup()
    expect(result.current.backup.notice).toMatchObject({ kind: 'up-to-date', forced: false })
    expect(result.current.phase).toBeNull()

    await act(() => result.current.backup.forceReimport())
    expect(mocks.importBackup).toHaveBeenNthCalledWith(2, expect.objectContaining({
      backup: GZIPPED, dryRun: true, force: true,
    }))
    expect(result.current.backup.review?.force).toBe(true)

    await act(() => result.current.backup.confirm())
    expect(mocks.importBackup).toHaveBeenNthCalledWith(3, expect.objectContaining({
      backup: GZIPPED, dryRun: false, force: true, allowLargeDelete: true,
    }))
    expect(mocks.gzipBackup).toHaveBeenCalledOnce()
    expect(result.current.success?.summary).toBe(CHANGE_SUMMARY)
  })

  it('shows the server explanation when the file is not a backup', async () => {
    mocks.importBackup.mockRejectedValueOnce({
      response: { status: 400, data: { detail: 'This is not a Money Manager backup.' } },
    })
    const { result } = await selectBackup()

    expect(result.current.backup.notice).toEqual({
      kind: 'failed', fileName: BACKUP_NAME, message: 'This is not a Money Manager backup.', retry: null,
    })
    expect(result.current.phase).toBeNull()
    expect(result.current.selectedFileName).toBeNull()
  })

  it('retries a timed-out import with the reviewed bytes, without another dry run', async () => {
    mocks.importBackup
      .mockResolvedValueOnce(PREVIEW)
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { isAxiosError: true, code: 'ECONNABORTED' }))
      .mockResolvedValueOnce(IMPORTED)
    const { result } = await selectBackup()
    await act(() => result.current.backup.confirm())

    const { notice } = result.current.backup
    if (notice?.kind !== 'failed') throw new Error('Expected a failed import notice')
    expect(notice.message).toContain('Check import history')
    expect(notice.retry?.preview).toEqual(PREVIEW)

    await act(() => result.current.backup.retry())
    expect(mocks.importBackup).toHaveBeenCalledTimes(3)
    expect(mocks.importBackup).toHaveBeenLastCalledWith(expect.objectContaining({
      backup: GZIPPED, dryRun: false,
    }))
    expect(result.current.success?.summary).toBe(CHANGE_SUMMARY)
  })

  it('keeps the insights-only retry when the saved import could not refresh', async () => {
    mocks.importBackup.mockResolvedValueOnce(PREVIEW).mockResolvedValueOnce({
      ...IMPORTED,
      analytics_status: 'failed',
      analytics_message: 'Your ledger is saved. Insights could not be refreshed. Retry the refresh.',
    })
    const { result } = await selectBackup()
    await act(() => result.current.backup.confirm())
    expect(result.current.success?.analyticsStatus).toBe('failed')

    mocks.refreshAnalytics.mockResolvedValueOnce(undefined)
    await act(() => result.current.handleRetryAnalytics())
    expect(result.current.success?.analyticsStatus).toBe('ready')
    expect(mocks.importBackup).toHaveBeenCalledTimes(2)
  })

  it('treats a skipped refresh as current only when the import changed nothing', () => {
    const nothingChanged = { ...PREVIEW.stats, inserted: 0, updated: 0, deleted: 0 }

    expect(toUploadAnalyticsStatus({ ...IMPORTED, analytics_status: 'skipped' })).toBe('unknown')
    expect(toUploadAnalyticsStatus({
      ...IMPORTED, analytics_status: 'skipped', stats: nothingChanged,
    })).toBe('ready')
  })

  it('keeps spreadsheets on the in-browser parser', async () => {
    const statement = new File(['date,amount'], 'statement.csv', { type: 'text/csv' })
    mocks.parseFile.mockResolvedValueOnce({ rows: [], fileName: 'statement.csv', fileHash: 'statement-hash' })
    const { wrapper } = setup()
    const { result } = renderHook(() => useUploadSync(), { wrapper })
    await act(() => result.current.handleFileSelect(statement))

    expect(mocks.parseFile).toHaveBeenCalledWith(statement)
    expect(mocks.gzipBackup).not.toHaveBeenCalled()
    expect(mocks.importBackup).not.toHaveBeenCalled()
    expect(result.current.review?.parsed.fileName).toBe('statement.csv')
    expect(result.current.backup.review).toBeNull()
  })

  it('is blocked in demo mode like a spreadsheet upload', async () => {
    mocks.demo.active = true
    const { result } = await selectBackup()

    expect(mocks.gzipBackup).not.toHaveBeenCalled()
    expect(mocks.importBackup).not.toHaveBeenCalled()
    expect(result.current.phase).toBeNull()
  })

  it('drops a dry run that finishes in a newer session', async () => {
    let finish: (preview: MoneyManagerImportResponse) => void = () => undefined
    mocks.importBackup.mockReturnValueOnce(new Promise<MoneyManagerImportResponse>((resolve) => {
      finish = resolve
    }))
    const { wrapper } = setup()
    const { result } = renderHook(() => useUploadSync(), { wrapper })

    const selection = act(() => result.current.handleFileSelect(BACKUP))
    await vi.waitFor(() => expect(mocks.importBackup).toHaveBeenCalledOnce())
    clearSessionData()
    finish(PREVIEW)
    await selection

    expect(result.current.backup.review).toBeNull()
    expect(result.current.phase).toBeNull()
  })
})

describe('UploadSyncPage with a Money Manager backup', () => {
  it('reviews, imports, and then reloads the import history', async () => {
    mocks.importBackup.mockResolvedValueOnce(PREVIEW).mockResolvedValueOnce(IMPORTED)
    const { wrapper } = setup()
    render(<UploadSyncPage />, { wrapper })
    await waitFor(() => expect(mocks.getImportHistory).toHaveBeenCalledOnce())

    const input = document.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('Expected upload file input')
    fireEvent.change(input, { target: { files: [BACKUP] } })
    const replace = await screen.findByRole('button', { name: 'Replace ledger with this backup' })
    fireEvent.click(screen.getByRole('checkbox', { name: /complete Money Manager ledger/ }))
    fireEvent.click(replace)

    expect(await screen.findByText('Import complete')).toBeInTheDocument()
    expect(screen.getByText(CHANGE_SUMMARY, { exact: false })).toBeInTheDocument()
    await waitFor(() => expect(mocks.getImportHistory).toHaveBeenCalledTimes(2))
    expect(mocks.prefetchCoreData).toHaveBeenCalledOnce()
  })
})

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ParseResult } from '@/lib/fileParser'

import UploadFeedback from '../components/UploadFeedback'
import UploadReview from '../components/UploadReview'
import { useUploadSync } from '../useUploadSync'

const mocks = vi.hoisted(() => ({
  parseFile: vi.fn(),
  mutateAsync: vi.fn(),
  refreshAnalytics: vi.fn(),
}))

vi.mock('@/lib/fileParser', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/fileParser')>(),
  parseFile: mocks.parseFile,
}))
vi.mock('@/hooks/api/useUpload', () => ({
  useUpload: () => ({ mutateAsync: mocks.mutateAsync }),
}))
vi.mock('@/hooks/useDemoGuard', () => ({
  useDemoGuard: () => ({ guardDemoAction: () => false }),
}))
vi.mock('@/services/api/upload', () => ({
  uploadService: { refreshAnalytics: mocks.refreshAnalytics },
}))

const PARSED: ParseResult = {
  rows: [{
    date: '2026-01-15', amount: 100, currency: 'INR', type: 'Expense',
    account: 'Cash', category: 'Food',
  }],
  fileName: 'statement.csv',
  fileHash: 'test-hash',
}

describe('UploadFeedback', () => {
  it('announces a completed import with its summary', () => {
    render(
      <UploadFeedback
        conflict={null}
        failure={null}
        success={{
          fileName: 'statement.csv', summary: '20 inserted, 4 skipped.',
          analyticsStatus: 'ready', analyticsMessage: null,
        }}
        isBusy={false}
        onForceReupload={vi.fn()}
        onRetryUpload={vi.fn<() => Promise<void>>().mockResolvedValue()}
        onRetryAnalytics={vi.fn<() => Promise<void>>().mockResolvedValue()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Import complete')
    expect(screen.getByRole('status')).toHaveTextContent('20 inserted, 4 skipped.')
  })

  it('lets the user synchronize a previously imported file', () => {
    const onForceReupload = vi.fn()

    render(
      <UploadFeedback
        conflict={{ parsed: PARSED }}
        failure={null}
        success={null}
        isBusy={false}
        onForceReupload={onForceReupload}
        onRetryUpload={vi.fn<() => Promise<void>>().mockResolvedValue()}
        onRetryAnalytics={vi.fn<() => Promise<void>>().mockResolvedValue()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sync changes' }))

    expect(onForceReupload).toHaveBeenCalledOnce()
  })

  it('offers a working retry after an upload failure', () => {
    const onRetryUpload = vi.fn<() => Promise<void>>().mockResolvedValue()

    render(
      <UploadFeedback
        conflict={null}
        failure={{ parsed: PARSED, fileName: PARSED.fileName, message: 'Network unavailable', force: false }}
        success={null}
        isBusy={false}
        onForceReupload={vi.fn()}
        onRetryUpload={onRetryUpload}
        onRetryAnalytics={vi.fn<() => Promise<void>>().mockResolvedValue()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'statement.csv: Network unavailable',
    )
    expect(onRetryUpload).toHaveBeenCalledOnce()
  })

  it('keeps a saved import visible while offering an insights-only retry', () => {
    const onRetryAnalytics = vi.fn<() => Promise<void>>().mockResolvedValue()
    render(
      <UploadFeedback
        conflict={null}
        failure={null}
        success={{
          fileName: 'statement.csv', summary: '1 inserted.',
          analyticsStatus: 'failed', analyticsMessage: 'Your ledger is saved; refresh failed.',
        }}
        isBusy={false}
        onForceReupload={vi.fn()}
        onRetryUpload={vi.fn<() => Promise<void>>().mockResolvedValue()}
        onRetryAnalytics={onRetryAnalytics}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry insights refresh' }))
    expect(screen.getByRole('status')).toHaveTextContent('Import complete')
    expect(screen.getByText('This will not re-import your file.')).toBeInTheDocument()
    expect(onRetryAnalytics).toHaveBeenCalledOnce()
  })
})

describe('UploadReview', () => {
  it('requires an intentional acknowledgment of the replacement scope', () => {
    const onConfirm = vi.fn<() => Promise<void>>().mockResolvedValue()
    render(
      <UploadReview
        review={{ parsed: PARSED, force: false }}
        isBusy={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    const replace = screen.getByRole('button', { name: 'Replace ledger with this snapshot' })
    expect(replace).toBeDisabled()
    expect(screen.getByText('Scope: your entire ledger')).toBeInTheDocument()
    expect(screen.getByText('2026-01-15 to 2026-01-15')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(replace).toBeEnabled()
    fireEvent.click(replace)
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

describe('useUploadSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.parseFile.mockResolvedValue(PARSED)
    mocks.mutateAsync.mockResolvedValue({
      success: true, analytics_status: 'ready',
      stats: { inserted: 1, updated: 0, deleted: 0, unchanged: 0 },
    })
  })

  it('does not upload until review is confirmed and does not rebuild analytics twice', async () => {
    const { result } = renderHook(() => useUploadSync(), { wrapper })
    await act(() => result.current.handleFileSelect(new File(['csv'], 'statement.csv')))
    expect(result.current.phase).toBe('review')
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
    await act(() => result.current.handleConfirmUpload())
    expect(mocks.mutateAsync).toHaveBeenCalledOnce()
    expect(mocks.refreshAnalytics).not.toHaveBeenCalled()
    expect(result.current.success?.analyticsStatus).toBe('ready')
  })

  it('retries a failed refresh without importing the file again', async () => {
    mocks.mutateAsync.mockResolvedValue({
      success: true, analytics_status: 'failed',
      stats: { inserted: 1, updated: 0, deleted: 0, unchanged: 0 },
    })
    const { result } = renderHook(() => useUploadSync(), { wrapper })
    await act(() => result.current.handleFileSelect(new File(['csv'], 'statement.csv')))
    await act(() => result.current.handleConfirmUpload())
    expect(result.current.success?.analyticsStatus).toBe('failed')
    mocks.refreshAnalytics.mockRejectedValueOnce(new Error('Refresh still unavailable'))
    await act(() => result.current.handleRetryAnalytics())
    expect(result.current.success?.analyticsStatus).toBe('failed')
    expect(result.current.success?.analyticsMessage).toContain('still unavailable')
    mocks.refreshAnalytics.mockResolvedValueOnce(undefined)
    await act(() => result.current.handleRetryAnalytics())
    expect(result.current.success?.analyticsStatus).toBe('ready')
    expect(mocks.mutateAsync).toHaveBeenCalledOnce()
    expect(mocks.refreshAnalytics).toHaveBeenCalledTimes(2)
  })

  it('requires a second scope review before a forced duplicate import', async () => {
    mocks.mutateAsync.mockRejectedValueOnce({
      response: { status: 409, data: { detail: 'File already imported' } },
    })
    const { result } = renderHook(() => useUploadSync(), { wrapper })
    await act(() => result.current.handleFileSelect(new File(['csv'], 'statement.csv')))
    await act(() => result.current.handleConfirmUpload())
    expect(result.current.conflict?.parsed).toEqual(PARSED)
    act(() => result.current.handleForceReupload())
    expect(result.current.review?.force).toBe(true)
    expect(mocks.mutateAsync).toHaveBeenCalledOnce()
    await act(() => result.current.handleConfirmUpload())
    expect(mocks.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }))
  })
})

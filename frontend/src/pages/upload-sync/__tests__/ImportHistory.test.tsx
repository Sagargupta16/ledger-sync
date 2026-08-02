/**
 * Guards the Upload page's import-history panel.
 *
 * `import_logs` was written on every upload from the first release but never
 * displayed, so "did that import land, and what did it change?" was only
 * answerable from the database. These tests cover the render path the browser
 * pane cannot prove here (its viewport measures 0px, so charts and layout do
 * not lay out): the columns, the most-recent-first order, the "showing N of M"
 * copy, the empty and error states, and the demo-mode suppression.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImportHistoryResponse } from '@/services/api/upload'

import ImportHistory from '../components/ImportHistory'

// Typed rather than a bare `vi.fn()`: an untyped mock returns `any`, which the
// wrapper below would then leak into the service's Promise contract.
const getImportHistory = vi.fn<(limit?: number) => Promise<ImportHistoryResponse>>()
const isDemoMode = vi.fn(() => false)

vi.mock('@/services/api/upload', () => ({
  uploadService: {
    getImportHistory: (limit?: number) => getImportHistory(limit),
  },
}))

vi.mock('@/store/demoStore', () => ({
  isDemoMode: () => isDemoMode(),
}))

/** Shape of the live account's four imports, counts only. */
const HISTORY: ImportHistoryResponse = {
  imports: [
    {
      id: 4,
      file_name: 'newest.xlsx',
      file_hash: 'cf59d9ef'.repeat(8),
      imported_at: '2026-08-01T11:31:29.482055+00:00',
      rows_processed: 8216,
      rows_inserted: 31,
      rows_updated: 0,
      rows_deleted: 0,
      rows_skipped: 8185,
    },
    {
      id: 3,
      file_name: 'older.xlsx',
      file_hash: 'f7858e92'.repeat(8),
      imported_at: '2026-07-26T15:47:38.621079+00:00',
      rows_processed: 8181,
      rows_inserted: 508,
      rows_updated: 716,
      rows_deleted: 0,
      rows_skipped: 6957,
    },
  ],
  total_count: 4,
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ImportHistory />
    </QueryClientProvider>,
  )
}

describe('ImportHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isDemoMode.mockReturnValue(false)
    getImportHistory.mockResolvedValue(HISTORY)
  })

  it('lists each past import with its row counts', async () => {
    renderPanel()

    expect(await screen.findByText('newest.xlsx')).toBeInTheDocument()
    expect(screen.getByText('older.xlsx')).toBeInTheDocument()
    // Counts are shown verbatim, locale-grouped.
    expect(screen.getByText('8,216')).toBeInTheDocument()
    expect(screen.getByText('6,957')).toBeInTheDocument()
  })

  it('keeps the API order, most recent first', async () => {
    renderPanel()
    await screen.findByText('newest.xlsx')

    const body = document.body.textContent ?? ''
    expect(body.indexOf('newest.xlsx')).toBeLessThan(body.indexOf('older.xlsx'))
  })

  it('says how many of the total imports are shown', async () => {
    renderPanel()

    expect(await screen.findByText(/Showing the 2 most recent of 4 imports/)).toBeInTheDocument()
  })

  it('does not claim truncation when every import is listed', async () => {
    getImportHistory.mockResolvedValue({ ...HISTORY, total_count: 2 })
    renderPanel()

    expect(await screen.findByText(/Every import recorded for this account/)).toBeInTheDocument()
  })

  it('renders an empty state rather than a bare table on a fresh account', async () => {
    getImportHistory.mockResolvedValue({ imports: [], total_count: 0 })
    renderPanel()

    expect(await screen.findByText('No imports yet')).toBeInTheDocument()
  })

  it('offers a retry when the request fails', async () => {
    getImportHistory.mockRejectedValue(new Error('network'))
    renderPanel()

    expect(await screen.findByText(/Could not load import history/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('is hidden in demo mode, and makes no request', async () => {
    isDemoMode.mockReturnValue(true)
    const { container } = renderPanel()

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement()
    })
    // Demo mode has no server-side import log; a request would 401.
    expect(getImportHistory).not.toHaveBeenCalled()
  })

  it('renders the UTC timestamp as a local date, not the raw ISO string', async () => {
    renderPanel()
    await screen.findByText('newest.xlsx')

    expect(screen.queryByText(/2026-08-01T11:31:29/)).not.toBeInTheDocument()
    expect(screen.getByText(/1 Aug 2026/)).toBeInTheDocument()
  })
})

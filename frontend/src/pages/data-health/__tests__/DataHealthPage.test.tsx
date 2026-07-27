import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DataHealth } from '@/services/api/analyticsV2'

const mocks = vi.hoisted(() => ({ getDataHealth: vi.fn(), refreshAnalytics: vi.fn() }))

vi.mock('@/services/api/analyticsV2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api/analyticsV2')>()
  return { ...actual, analyticsV2Service: { ...actual.analyticsV2Service, getDataHealth: mocks.getDataHealth } }
})

vi.mock('@/services/api/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api/upload')>()
  return {
    ...actual,
    uploadService: { ...actual.uploadService, refreshAnalytics: mocks.refreshAnalytics },
  }
})

const DataHealthPage = (await import('../DataHealthPage')).default

const STALE: DataHealth = {
  last_import_at: '2026-07-04T09:12:00Z',
  days_stale: 22,
  last_import_file_name: 'Cashbook.xlsx',
  rows_processed: 8024,
  rows_inserted: 62,
  rows_updated: 0,
  rows_skipped: 7962,
  rollups_calculated_at: '2026-07-04T09:12:03Z',
  rollups_stale: false,
  transaction_count: 5089,
  earliest_date: '2022-04-01',
  latest_date: '2026-07-04',
  future_dated_count: 6,
  placeholder_note_count: 497,
  uncategorized_count: 659,
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DataHealthPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/**
 * D-11: the app displayed every metric with total confidence while its newest
 * row was 2026-07-04 and the calendar said 2026-07-26. These assert the page
 * states the gap in concrete days and dates rather than hedging with "data may
 * be stale", and that a failed fetch never renders as "no issues found".
 */
describe('DataHealthPage', () => {
  beforeEach(() => {
    mocks.getDataHealth.mockReset()
    mocks.refreshAnalytics.mockReset()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 26))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('names the exact end date and unimported day count', async () => {
    mocks.getDataHealth.mockResolvedValue(STALE)
    renderPage()

    expect(
      await screen.findByText(/Data ends Jul 04, 2026\. 22 days unimported\./),
    ).toBeInTheDocument()
    expect(screen.getByText(/Last import: Cashbook\.xlsx, 22 days ago\./)).toBeInTheDocument()
    // The call to action has to point at the upload route, not just complain.
    expect(screen.getByRole('link', { name: /upload latest file/i })).toHaveAttribute(
      'href',
      '/upload',
    )
  })

  it('surfaces the data-quality counts that had no home before', async () => {
    mocks.getDataHealth.mockResolvedValue(STALE)
    renderPage()

    expect(await screen.findByText('Data quality')).toBeInTheDocument()
    expect(screen.getByText('497')).toBeInTheDocument()
    expect(screen.getByText('659')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    // 62 inserted out of 8,024 read is the import that caused the whole defect.
    expect(screen.getByText('8,024')).toBeInTheDocument()
    expect(screen.getByText('62')).toBeInTheDocument()
    // The 7,962 matched rows must not be presented as rejected.
    expect(screen.getByText('7,962')).toBeInTheDocument()
    expect(screen.getByText('Rows already present')).toBeInTheDocument()
    expect(screen.queryByText(/rows skipped/i)).not.toBeInTheDocument()
  })

  it('shows the error state instead of a clean bill of health when the fetch fails', async () => {
    mocks.getDataHealth.mockRejectedValue(new Error('boom'))
    renderPage()

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.queryByText('Data quality')).not.toBeInTheDocument()
    expect(screen.queryByText(/no issues detected/i)).not.toBeInTheDocument()
  })

  it('does not nag when the ledger is current', async () => {
    mocks.getDataHealth.mockResolvedValue({
      ...STALE,
      latest_date: '2026-07-26',
      days_stale: 0,
      future_dated_count: 0,
    })
    renderPage()

    expect(await screen.findByText(/Data is current through Jul 26, 2026\./)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /upload latest file/i })).not.toBeInTheDocument()
  })

  it('offers the upload path on an untouched account', async () => {
    mocks.getDataHealth.mockResolvedValue({
      ...STALE,
      last_import_at: null,
      days_stale: null,
      last_import_file_name: null,
      earliest_date: null,
      latest_date: null,
      rows_processed: null,
      rows_inserted: null,
      rows_updated: null,
      rows_skipped: null,
      transaction_count: 0,
      future_dated_count: 0,
      placeholder_note_count: 0,
      uncategorized_count: 0,
    })
    renderPage()

    expect(await screen.findByText(/nothing imported yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /upload a statement/i })).toHaveAttribute(
      'href',
      '/upload',
    )
  })

  /**
   * The rollup-staleness defect: on 2026-07-26 the import committed 508 inserts
   * and 373 deletes, its analytics refresh did not land, and every rollup table
   * stayed stamped 2026-07-04. July expenses displayed 74,523.22 against a true
   * 107,651.65 for 22 days. `upload.py` swallows that refresh failure on purpose
   * so a Neon timeout can never reject committed rows, which means this page is
   * the only place the divergence can be seen or fixed.
   */
  describe('stale rollups', () => {
    it('says the displayed numbers are from a previous import', async () => {
      mocks.getDataHealth.mockResolvedValue({ ...STALE, rollups_stale: true })
      renderPage()

      expect(await screen.findByText('Analytics behind import')).toBeInTheDocument()
      expect(screen.getByText('Out of date')).toBeInTheDocument()
      expect(screen.getByText(/from the previous import/i)).toBeInTheDocument()
    })

    it('rebuilds the rollups in place instead of demanding a re-upload', async () => {
      mocks.getDataHealth.mockResolvedValue({ ...STALE, rollups_stale: true })
      mocks.refreshAnalytics.mockResolvedValue(undefined)
      renderPage()

      const button = await screen.findByRole('button', { name: /recompute analytics/i })
      fireEvent.click(button)

      await waitFor(() => expect(mocks.refreshAnalytics).toHaveBeenCalledTimes(1))
    })

    it('tells the user when the recompute itself failed', async () => {
      // A fix that fails quietly repeats the original defect, so the failure has
      // to be said out loud -- and it has to say the data is untouched, because
      // the user's next thought is "did I just break something".
      mocks.getDataHealth.mockResolvedValue({ ...STALE, rollups_stale: true })
      mocks.refreshAnalytics.mockRejectedValue(new Error('statement timeout'))
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: /recompute analytics/i }))

      // Scoped to the failure text: the staleness banner is itself an alert, so
      // a bare getByRole('alert') matches two nodes.
      const failure = await screen.findByText(/did not go through/i)
      expect(failure).toHaveAttribute('role', 'alert')
      expect(failure).toHaveTextContent(/data is unchanged/i)
    })

    it('offers no button and no verdict when the rollups are current', async () => {
      mocks.getDataHealth.mockResolvedValue({ ...STALE, rollups_stale: false })
      renderPage()

      expect(await screen.findByText('Data quality')).toBeInTheDocument()
      expect(screen.getByText('Up to date')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /recompute analytics/i }),
      ).not.toBeInTheDocument()
    })
  })
})

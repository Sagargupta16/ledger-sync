import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DataHealth } from '@/services/api/analyticsV2'

const mocks = vi.hoisted(() => ({ getDataHealth: vi.fn() }))

vi.mock('@/services/api/analyticsV2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api/analyticsV2')>()
  return {
    ...actual,
    analyticsV2Service: { ...actual.analyticsV2Service, getDataHealth: mocks.getDataHealth },
  }
})

const StaleAnalyticsAlert = (await import('../StaleAnalyticsAlert')).default

const HEALTH: DataHealth = {
  last_import_at: '2026-07-26T10:17:38Z',
  days_stale: 0,
  last_import_file_name: 'Cashbook.xlsx',
  rows_processed: 8181,
  rows_inserted: 508,
  rows_updated: 0,
  rows_skipped: 7300,
  rollups_calculated_at: '2026-07-04T08:07:41Z',
  rollups_stale: true,
  transaction_count: 7338,
  earliest_date: '2012-07-01',
  latest_date: '2026-07-26',
  future_dated_count: 0,
  placeholder_note_count: 0,
  uncategorized_count: 0,
}

function renderAlert(path = '/dashboard') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <StaleAnalyticsAlert />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/**
 * The defect: the 2026-07-26 import committed 508 inserts, its analytics refresh
 * did not land, and every rollup table stayed stamped 2026-07-04. July expenses
 * displayed 74,523.22 against a true 107,651.65 for 22 days. The Data Health page
 * can report that, but the user being misled is the one reading Dashboard, and
 * they have no reason to open a diagnostics page. Hence a shell-level alert.
 */
describe('StaleAnalyticsAlert', () => {
  beforeEach(() => {
    mocks.getDataHealth.mockReset()
  })

  it('warns on a normal page when the rollups are behind the last import', async () => {
    mocks.getDataHealth.mockResolvedValue(HEALTH)
    renderAlert()

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText(/These figures are out of date\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /fix this/i })).toHaveAttribute('href', '/data-health')
  })

  it('stays silent when the rollups absorbed the last import', async () => {
    mocks.getDataHealth.mockResolvedValue({ ...HEALTH, rollups_stale: false })
    renderAlert()

    await waitFor(() => expect(mocks.getDataHealth).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stays silent when the backend does not report the field at all', async () => {
    // The frontend deploys to GitHub Pages independently of the Vercel backend,
    // so a newer client can meet an older API. Undefined means "nobody checked",
    // which must not be rendered as a confident warning.
    const older = { ...HEALTH }
    delete (older as Partial<DataHealth>).rollups_stale
    mocks.getDataHealth.mockResolvedValue(older)
    renderAlert()

    await waitFor(() => expect(mocks.getDataHealth).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not double up on the Data Health page, which has its own warning', async () => {
    mocks.getDataHealth.mockResolvedValue(HEALTH)
    renderAlert('/data-health')

    await waitFor(() => expect(mocks.getDataHealth).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('can be dismissed for the session without persisting the dismissal', async () => {
    mocks.getDataHealth.mockResolvedValue(HEALTH)
    const { unmount } = renderAlert()

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /dismiss out-of-date warning/i }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())

    // Nothing was written anywhere, so the warning returns on the next mount.
    // Silencing "your money figures are wrong" permanently is not on offer.
    unmount()
    renderAlert()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})

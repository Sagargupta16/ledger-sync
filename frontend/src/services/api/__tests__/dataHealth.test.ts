import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DataHealth } from '../analyticsV2'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('../client', () => ({ apiClient: { get: mocks.get } }))

const { analyticsV2Service } = await import('../analyticsV2')

const VALID: DataHealth = {
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

/**
 * The Data Health page is the one screen whose job is to say "do not trust the
 * other screens". Rendering a malformed payload as zeroes would read as "your
 * data is perfect" -- the exact lie the page exists to prevent -- so a bad shape
 * has to reach the error state instead of the happy path.
 */
describe('analyticsV2Service.getDataHealth', () => {
  beforeEach(() => {
    mocks.get.mockReset()
  })

  it('returns the payload when every count is present', async () => {
    mocks.get.mockResolvedValue({ data: VALID })
    await expect(analyticsV2Service.getDataHealth()).resolves.toEqual(VALID)
    expect(mocks.get).toHaveBeenCalledWith('/api/analytics/v2/data-health')
  })

  it('rejects the generic V2 list envelope', async () => {
    // Demo mode resolves unrecognised /analytics/v2/* paths through a catch-all
    // that returns this shape, which has none of the health counts.
    mocks.get.mockResolvedValue({ data: { data: [], count: 0 } })
    await expect(analyticsV2Service.getDataHealth()).rejects.toThrow(/missing counts/)
  })

  it('names every count field that is missing', async () => {
    const rest: Record<string, unknown> = { ...VALID }
    delete rest.transaction_count
    mocks.get.mockResolvedValue({ data: rest })
    await expect(analyticsV2Service.getDataHealth()).rejects.toThrow(/transaction_count/)
  })

  it('rejects a count sent as a numeric string', async () => {
    mocks.get.mockResolvedValue({ data: { ...VALID, uncategorized_count: '659' } })
    await expect(analyticsV2Service.getDataHealth()).rejects.toThrow(/uncategorized_count/)
  })

  it('rejects a null body', async () => {
    mocks.get.mockResolvedValue({ data: null })
    await expect(analyticsV2Service.getDataHealth()).rejects.toThrow(/non-object payload/)
  })

  it('accepts the all-null import log a never-imported account returns', async () => {
    // The backend returns every import-log count as null (not 0) when there is
    // no `import_logs` row, so the guard must not treat that as malformed.
    const empty: DataHealth = {
      ...VALID,
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
    }
    mocks.get.mockResolvedValue({ data: empty })
    await expect(analyticsV2Service.getDataHealth()).resolves.toEqual(empty)
  })
})

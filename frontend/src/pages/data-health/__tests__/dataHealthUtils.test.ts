import { describe, expect, it } from 'vitest'

import type { DataHealth } from '@/services/api/analyticsV2'

import {
  assessFreshness,
  buildCoverage,
  buildImportLedger,
  buildQualityIssues,
  freshnessLevel,
  isEmptyLedger,
  unimportedDayGap,
} from '../dataHealthUtils'

/**
 * The defect these guard: the app displayed every metric with total confidence
 * while the newest row in the ledger was 2026-07-04 and the calendar said
 * 2026-07-26. Twenty-two days of rent, salary, and card spend were missing from
 * the savings rate, every budget, and the net-worth line, and nothing on any
 * screen said so.
 *
 * `now` is injected everywhere so these pin real dates instead of drifting with
 * the clock.
 */

/** 2026-07-26, local midnight -- the day the staleness was measured. */
const NOW = new Date(2026, 6, 26)

function health(overrides: Partial<DataHealth> = {}): DataHealth {
  return {
    last_import_at: '2026-07-04T09:12:00Z',
    days_stale: 22,
    last_import_file_name: 'Cashbook.xlsx',
    // Probed live from backend/ledger_sync.db on 2026-07-26: re-importing the
    // same workbook matched almost every row instead of rejecting it.
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
    ...overrides,
  }
}

describe('unimportedDayGap', () => {
  it('counts the days after the newest row up to today', () => {
    expect(unimportedDayGap('2026-07-04', NOW)).toBe(22)
  })

  it('is 0 when the newest row is today', () => {
    expect(unimportedDayGap('2026-07-26', NOW)).toBe(0)
  })

  it('is 1 the day after the newest row', () => {
    expect(unimportedDayGap('2026-07-25', NOW)).toBe(1)
  })

  it('does not go negative for a future-dated newest row', () => {
    expect(unimportedDayGap('2026-08-10', NOW)).toBe(0)
  })

  it('is 0 on an empty ledger', () => {
    expect(unimportedDayGap(null, NOW)).toBe(0)
  })

  it('spans a month boundary on the local calendar', () => {
    // 2026-06-30 -> 2026-07-26 is 26 days, not 26 minus a DST/UTC slip.
    expect(unimportedDayGap('2026-06-30', NOW)).toBe(26)
  })
})

describe('freshnessLevel', () => {
  it.each([
    [0, 'fresh'],
    [3, 'fresh'],
    [4, 'aging'],
    [7, 'aging'],
    [8, 'stale'],
    [14, 'stale'],
    [15, 'critical'],
    [22, 'critical'],
  ])('maps a %i day gap to %s', (gap, level) => {
    expect(freshnessLevel(gap)).toBe(level)
  })
})

describe('assessFreshness', () => {
  it('states the exact end date and gap, not "data may be stale"', () => {
    const result = assessFreshness(health(), NOW)
    expect(result.level).toBe('critical')
    expect(result.gapDays).toBe(22)
    expect(result.headline).toBe('Data ends Jul 04, 2026. 22 days unimported.')
    expect(result.detail).toBe('Last import: Cashbook.xlsx, 22 days ago.')
  })

  it('says the ledger is current when there is no gap', () => {
    const result = assessFreshness(health({ latest_date: '2026-07-26', days_stale: 0 }), NOW)
    expect(result.level).toBe('fresh')
    expect(result.headline).toBe('Data is current through Jul 26, 2026.')
    expect(result.detail).toBe('Last import: Cashbook.xlsx, today.')
  })

  it('singularises a one day gap', () => {
    const result = assessFreshness(health({ latest_date: '2026-07-25', days_stale: 1 }), NOW)
    expect(result.headline).toBe('Data ends Jul 25, 2026. 1 day unimported.')
  })

  it('falls back to the import timestamp when the server omits days_stale', () => {
    const result = assessFreshness(health({ days_stale: null }), NOW)
    expect(result.daysSinceImport).toBe(22)
    expect(result.detail).toBe('Last import: Cashbook.xlsx, 22 days ago.')
  })

  it('handles a ledger with no rows and no import', () => {
    const result = assessFreshness(
      health({
        latest_date: null,
        earliest_date: null,
        last_import_at: null,
        days_stale: null,
        transaction_count: 0,
      }),
      NOW,
    )
    expect(result.level).toBe('fresh')
    expect(result.headline).toBe('No transactions imported yet.')
    expect(result.detail).toBe('No import has run on this account.')
  })

  it('reports the gap even when the import itself ran today', () => {
    // Re-importing an OLD workbook today is the exact 2026-07-04 failure: the
    // import is fresh, the data is not.
    const result = assessFreshness(health({ days_stale: 0 }), NOW)
    expect(result.gapDays).toBe(22)
    expect(result.level).toBe('critical')
    expect(result.detail).toBe('Last import: Cashbook.xlsx, today.')
  })
})

describe('buildCoverage', () => {
  it('adds the unimported gap on top of the covered span', () => {
    const coverage = buildCoverage(health(), NOW)
    expect(coverage).not.toBeNull()
    // 2022-04-01 through 2026-07-04 inclusive.
    expect(coverage?.coveredDays).toBe(1556)
    expect(coverage?.gapDays).toBe(22)
    expect(coverage?.totalDays).toBe(1578)
  })

  it('is null when the ledger has no dates', () => {
    expect(buildCoverage(health({ earliest_date: null, latest_date: null }), NOW)).toBeNull()
  })
})

describe('buildQualityIssues', () => {
  it('escalates a double-digit share to critical and keeps a small one at warning', () => {
    const issues = buildQualityIssues(health())
    const byId = new Map(issues.map((i) => [i.id, i]))

    // 497 / 5089 = 9.8% -- under the 10% bar, so a warning.
    expect(byId.get('placeholder-notes')?.count).toBe(497)
    expect(byId.get('placeholder-notes')?.severity).toBe('warning')
    expect(byId.get('placeholder-notes')?.shareOfLedger).toBeCloseTo(9.77, 1)

    // 659 / 5089 = 12.9% -- the category system has stopped working.
    expect(byId.get('uncategorized')?.severity).toBe('critical')
    expect(byId.get('uncategorized')?.shareOfLedger).toBeCloseTo(12.95, 1)
  })

  it('flags any future-dated row regardless of how few', () => {
    const issues = buildQualityIssues(health({ future_dated_count: 1 }))
    const future = issues.find((i) => i.id === 'future-dated')
    expect(future?.severity).toBe('warning')
  })

  it('marks every check clean when the counts are zero', () => {
    const issues = buildQualityIssues(
      health({ placeholder_note_count: 0, uncategorized_count: 0, future_dated_count: 0 }),
    )
    expect(issues.map((i) => i.severity)).toEqual(['clean', 'clean', 'clean', 'clean'])
    expect(issues.every((i) => i.shareOfLedger === 0)).toBe(true)
  })

  it('does not divide by zero on an empty ledger', () => {
    const issues = buildQualityIssues(health({ transaction_count: 0 }))
    expect(issues.every((i) => Number.isFinite(i.shareOfLedger))).toBe(true)
  })

  describe('stale rollups', () => {
    it('leads the list, because it invalidates every other page', () => {
      // Ordering is the point: a user who reads one line has to read this one.
      // Every other issue describes rows that are merely low quality; this one
      // says the numbers on screen are not the numbers in the database.
      const issues = buildQualityIssues(health({ rollups_stale: true }))
      expect(issues[0]?.id).toBe('stale-rollups')
    })

    it('is critical with a fix button when the rollups are behind', () => {
      const issue = buildQualityIssues(health({ rollups_stale: true }))[0]
      expect(issue?.severity).toBe('critical')
      expect(issue?.actionLabel).toBe('Recompute analytics')
    })

    it('renders as a flag, not a one-row count', () => {
      // 1 row of 5,089 with a 0% bar would present the largest possible defect
      // as the smallest one, so the row opts out of the count presentation.
      const issue = buildQualityIssues(health({ rollups_stale: true }))[0]
      expect(issue?.kind).toBe('flag')
      expect(issue?.shareOfLedger).toBe(0)
    })

    it('is clean when the rollups absorbed the last import', () => {
      const issue = buildQualityIssues(health({ rollups_stale: false }))[0]
      expect(issue?.id).toBe('stale-rollups')
      expect(issue?.severity).toBe('clean')
    })

    it('drops the check entirely when the backend does not report it', () => {
      // The frontend deploys to GitHub Pages independently of the Vercel
      // backend, so a newer client can meet an older API. An absent field is
      // not a "false" -- announcing "Up to date" on a server that said nothing
      // is the false confidence this page exists to remove.
      const stripped = health()
      delete (stripped as Partial<DataHealth>).rollups_stale
      const issues = buildQualityIssues(stripped)
      expect(issues.some((i) => i.id === 'stale-rollups')).toBe(false)
      expect(issues).toHaveLength(3)
    })
  })
})

describe('buildImportLedger', () => {
  it('reports each import-log count as the backend sent it', () => {
    const rows = buildImportLedger(health())
    expect(rows.map((r) => [r.id, r.count])).toEqual([
      ['processed', 8024],
      ['inserted', 62],
      ['updated', 0],
      ['skipped', 7962],
    ])
  })

  it('does not describe matched rows as rejected or missing', () => {
    // The backend returns "skipped" for a row that matched a stored transaction
    // with no changes, so 7,962 of 8,024 skipped is a normal idempotent
    // re-upload. Calling it rejected would invent a catastrophe.
    const skipped = buildImportLedger(health()).find((r) => r.id === 'skipped')
    expect(skipped?.label).toBe('Rows already present')
    expect(skipped?.hint).not.toMatch(/reject|missing/i)
  })

  it('is empty when no import has ever run', () => {
    expect(
      buildImportLedger(
        health({
          rows_processed: null,
          rows_inserted: null,
          rows_updated: null,
          rows_skipped: null,
        }),
      ),
    ).toEqual([])
  })
})

describe('isEmptyLedger', () => {
  it('is true only when nothing was imported and nothing is stored', () => {
    expect(isEmptyLedger(health({ transaction_count: 0, last_import_at: null }))).toBe(true)
  })

  it('is false when an import ran but produced no rows', () => {
    // Something went wrong, so the page must show the import ledger rather than
    // the "get started" empty state.
    expect(isEmptyLedger(health({ transaction_count: 0 }))).toBe(false)
  })

  it('is false for a populated ledger', () => {
    expect(isEmptyLedger(health())).toBe(false)
  })
})

/**
 * Guards the SCOPE HONESTY of the Spending Patterns card.
 *
 * This card renders on the Expense Analysis page, whose `useAnalyticsTimeFilter`
 * narrows every other panel. The `cohort_spending` rollup it reads has no date
 * column and `GET /api/analytics/v2/cohort-spending` takes no date parameters,
 * so the window cannot be applied here at all. Silence was the defect: a user on
 * FY2024-25 saw all-time averages sitting next to correctly narrowed cards with
 * nothing saying the two answer different questions. On the real ledger the gap
 * inverts the ranking -- all-time the peak weekday is Sunday, but within
 * FY2024-25 it is Tuesday -- so these tests pin the disclosure text in place.
 */

import { QueryClient, QueryClientProvider, hashKey } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import type { CohortSpendingData } from '@/services/api/analyticsV2'

import CohortSpendingAnalysis from '../CohortSpendingAnalysis'

/**
 * Not hand-built: these are the literal rows of the `cohort_spending` table in
 * the local ledger, with the same 0=Sun..6=Sat remap the endpoint applies
 * (`_PY_WEEKDAY_TO_JS` in analytics_v2_impl/summaries.py), so this is a payload
 * the API can actually produce. `avg` arrives precomputed with the
 * occurrence-correct divisor -- the client never re-divides.
 *
 * Sunday (bucket 0) is the peak weekday at ~2,286/day and Thursday (bucket 4)
 * the quietest. Copying from the rollup matters: the builder queries through
 * `_user_transaction_query`, which filters `is_deleted IS false`, and the ledger
 * has 377 soft-deleted rows. Averaging the raw table instead promotes Tuesday to
 * the peak -- a reading the backend will never emit.
 */
const COHORT: CohortSpendingData = {
  day_of_week: [
    { bucket: 0, total: 893_786.32, occurrences: 391, avg: 2285.9 },
    { bucket: 1, total: 646_464.96, occurrences: 391, avg: 1653.36 },
    { bucket: 2, total: 669_500.85, occurrences: 391, avg: 1712.28 },
    { bucket: 3, total: 473_326.12, occurrences: 390, avg: 1213.66 },
    { bucket: 4, total: 402_033.01, occurrences: 391, avg: 1028.22 },
    { bucket: 5, total: 420_138.23, occurrences: 391, avg: 1074.52 },
    { bucket: 6, total: 458_686.62, occurrences: 391, avg: 1173.11 },
  ],
  day_of_month: [{ bucket: 1, total: 1_737_641.12, occurrences: 90, avg: 19_307.12 }],
  month_of_year: [{ bucket: 12, total: 600_426.78, occurrences: 7, avg: 85_775.25 }],
}

/** `null` seeds nothing, standing in for the pre-resolve state. Not `undefined`:
 *  that would silently fall through to the default parameter. */
function renderCard(data: CohortSpendingData | null = COHORT) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (data) qc.setQueryData(analyticsV2Keys.cohortSpending(), data)
  render(
    <QueryClientProvider client={qc}>
      <CohortSpendingAnalysis />
    </QueryClientProvider>,
  )
  return qc
}

describe('CohortSpendingAnalysis', () => {
  it('discloses its all-time scope in text the user reads', () => {
    renderCard()

    // A pill on the heading, so the qualifier is read WITH the title.
    expect(screen.getByText('All time')).toBeInTheDocument()
    // Plus a full sentence, because a two-word pill next to a filtered page does
    // not by itself tell a reader the peak below spans a different window.
    expect(
      screen.getByText(/Covers your full history regardless of the period selected above/),
    ).toBeInTheDocument()
  })

  it('keeps the disclosure visible in every view, not just the default', () => {
    renderCard()

    for (const [label, noun] of [
      ['By Date', 'date'],
      ['Seasonal', 'month'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(screen.getByText('All time')).toBeInTheDocument()
      expect(
        screen.getByText(new RegExp(`every occurrence of a ${noun} to divide by`)),
      ).toBeInTheDocument()
    }
  })

  it('carries the scope caveat into the chart accessible name', () => {
    renderCard()

    // The pill and caption are the sighted reader's caveat; dropping it here
    // would leave a screen-reader user with the unqualified claim.
    expect(
      screen.getByLabelText(
        'Bar chart of average spending by day of the week, covering all time regardless of the selected period',
      ),
    ).toBeInTheDocument()
  })

  it('reads the cohort rollup only and never the full transactions ledger', () => {
    const qc = renderCard()

    const observed = qc
      .getQueryCache()
      .getAll()
      .filter((q) => q.getObserversCount() > 0)
      .map((q) => hashKey(q.queryKey))
    expect(observed).toEqual([hashKey(analyticsV2Keys.cohortSpending())])
    expect(observed.some((key) => key.includes('"transactions"'))).toBe(false)
  })

  it('renders the server-computed averages rather than recomputing a divisor', () => {
    renderCard()

    // Sunday is the peak weekday in the rollup and Thursday the quietest.
    // Asserting the insight strip pins the reading to the rollup's
    // occurrence-correct divisor -- a client that re-averaged over the rows
    // present, or an oracle that skipped the soft-delete filter, would land on
    // Tuesday instead. "Sun" also appears in the chart's sr-only data table, so
    // scope the lookup to the peak paragraph.
    expect(screen.getByText('Peak Day')).toBeInTheDocument()
    const peakLine = screen.getByText('Sun', { selector: 'span' })
    expect(peakLine).toBeInTheDocument()
    expect(peakLine.parentElement?.textContent).toContain('2.3K')
    expect(screen.getByText('Thu', { selector: 'p' })).toBeInTheDocument()
  })

  it('still discloses scope when the rollup has not resolved yet', () => {
    renderCard(null)

    expect(screen.getByText('No expense data available')).toBeInTheDocument()
    // The caveat is unconditional: a reader who sees an empty panel next to
    // populated filtered ones should learn it is not the date filter's doing.
    expect(screen.getByText('All time')).toBeInTheDocument()
    expect(screen.getByText(/Covers your full history/)).toBeInTheDocument()
  })
})

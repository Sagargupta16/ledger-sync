/**
 * Guards the Dashboard's income-vs-spending panel.
 *
 * The Dashboard had only two pies, which answer "what share of my money went
 * where" and cannot answer "is it getting worse" at all. This panel adds the
 * per-month comparison.
 *
 * The browser pane cannot verify it here -- its viewport measures 0px, so
 * recharts' ResponsiveContainer gets zero width and draws no bars (the
 * pre-existing pies measure 0 too). What IS verifiable is the accessible data
 * table recharts renders alongside the SVG, plus the partial-month disclosure,
 * which is the part that would silently mislead if it regressed.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { MonthlyFlowDatum } from '@/hooks/useDashboardMetrics'

import MonthlyFlowChart from '../MonthlyFlowChart'

const MONTHS: MonthlyFlowDatum[] = [
  { month: '2026-05', label: 'May 26', income: 190_971, expense: 71_456 },
  { month: '2026-06', label: 'Jun 26', income: 203_332, expense: 110_038 },
  { month: '2026-07', label: 'Jul 26', income: 190_648, expense: 93_736 },
]

describe('MonthlyFlowChart', () => {
  it('exposes every month through the accessible data table', () => {
    render(<MonthlyFlowChart data={MONTHS} partialMonthLabel={null} />)

    const table = screen.getByRole('table', { hidden: true })
    expect(table).toBeInTheDocument()
    for (const row of MONTHS) {
      expect(screen.getByText(row.label)).toBeInTheDocument()
    }
  })

  it('names the excluded in-progress month instead of dropping a bar silently', () => {
    render(<MonthlyFlowChart data={MONTHS} partialMonthLabel="August 2026" />)

    expect(screen.getByText(/August 2026 is still in progress/)).toBeInTheDocument()
  })

  it('says nothing about partial months when every month is complete', () => {
    render(<MonthlyFlowChart data={MONTHS} partialMonthLabel={null} />)

    expect(screen.queryByText(/still in progress/)).not.toBeInTheDocument()
  })

  it('explains itself when the period holds no complete month', () => {
    render(<MonthlyFlowChart data={[]} partialMonthLabel="August 2026" />)

    expect(screen.getByText('Not enough complete months')).toBeInTheDocument()
  })

  it('carries an accessible name for the chart', () => {
    render(<MonthlyFlowChart data={MONTHS} partialMonthLabel={null} />)

    expect(
      screen.getByRole('img', { name: 'Monthly income versus spending bar chart' }),
    ).toBeInTheDocument()
  })
})

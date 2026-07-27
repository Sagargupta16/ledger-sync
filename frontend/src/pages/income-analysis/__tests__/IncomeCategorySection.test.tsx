/**
 * Guards the accessible name on the income donut.
 *
 * The section used to wrap the chart in its own `role="img"` div. That was
 * wrong once `StandardPieChart` started rendering an sr-only data table as a
 * SIBLING of the chart: an outer `role="img"` makes every descendant
 * PRESENTATIONAL, so the table a screen reader is supposed to read got hidden
 * again. The fix passes `ariaLabel` to the chart instead
 * (`ChartContainer` puts `role="img"` + the label on the chart's own wrapper).
 *
 * That substitution is only safe if the accessible name actually survives, so
 * these tests pin BOTH halves: the named image and the reachable table.
 *
 * Recharts needs a measured container and jsdom reports 0x0, so the wedges never
 * paint -- the accessible layer is the testable contract here.
 */

import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import IncomeCategorySection from '../components/IncomeCategorySection'
import type { IncomeCategoryDatum } from '../useIncomeAnalysis'

const DATA: IncomeCategoryDatum[] = [
  { name: 'Employment Income', category: 'Employment Income', value: 450000, color: '#0ea5e9' },
  { name: 'Refunds & Cashbacks', category: 'Refunds & Cashbacks', value: 53795, color: '#22c55e' },
  { name: 'Investment Income', category: 'Investment Income', value: 25592, color: '#a855f7' },
]

const LABEL = 'Donut chart breaking down total income by source category'

describe('IncomeCategorySection accessibility', () => {
  it('names the donut via the chart ariaLabel', () => {
    render(<IncomeCategorySection data={DATA} totalIncome={529387} onSelectCategory={() => {}} />)

    expect(screen.getByRole('img', { name: LABEL })).toBeInTheDocument()
  })

  it('keeps the data table OUTSIDE the named image', () => {
    // The actual regression, and the only assertion that catches it: a
    // hand-rolled role="img" wrapper enclosed both the chart AND the sr-only
    // table, and ARIA presentational children then drop the table from the
    // accessibility tree. jsdom + dom-accessibility-api do NOT implement
    // presentational children, so `getByRole('table')` still finds it either
    // way -- the containment check is what distinguishes the two DOMs.
    render(<IncomeCategorySection data={DATA} totalIncome={529387} onSelectCategory={() => {}} />)

    const img = screen.getByRole('img', { name: LABEL })
    const table = screen.getByRole('table')
    expect(img.contains(table)).toBe(false)
    expect(within(table).getByText('Refunds & Cashbacks')).toBeInTheDocument()
  })

  it('exposes exactly one named image, so the label is not duplicated', () => {
    render(<IncomeCategorySection data={DATA} totalIncome={529387} onSelectCategory={() => {}} />)

    expect(screen.getAllByRole('img', { name: LABEL })).toHaveLength(1)
  })

  it('maps both cashback spellings to the wallet icon, not the fallback', () => {
    // Cosmetic, but it is the same key-drift class: with only the singular
    // "Refund & Cashbacks" key mapped, every real (plural) row fell through to
    // the generic DollarSign.
    render(
      <IncomeCategorySection
        data={[
          { name: 'Refunds & Cashbacks', category: 'Refunds & Cashbacks', value: 100, color: '#0f0' },
          { name: 'Refund & Cashbacks', category: 'Refund & Cashbacks', value: 100, color: '#0f0' },
          { name: 'Mystery Category', category: 'Mystery Category', value: 100, color: '#0f0' },
        ]}
        totalIncome={300}
        onSelectCategory={() => {}}
      />,
    )

    const iconClass = (name: RegExp) =>
      screen.getByRole('button', { name }).querySelector('svg')?.getAttribute('class') ?? ''
    expect(iconClass(/^Refunds & Cashbacks/)).toContain('lucide-wallet')
    expect(iconClass(/^Refund & Cashbacks/)).toContain('lucide-wallet')
    // The fallback still applies to a category nobody mapped.
    expect(iconClass(/^Mystery Category/)).toContain('lucide-dollar-sign')
  })
})

/**
 * The empty state used to read "Configure income categories in Settings to see
 * breakdown." with a "Go to Settings" button. This breakdown is the backend's
 * `category_breakdown`, bucketed from `transaction.category` alone
 * (`calculations_helpers.py::_compute_income_analysis`); the Settings
 * income-classification lists feed the cashback total and nothing here. So the
 * one action offered could not fix the empty chart, while the two things that
 * DO empty it -- no income rows, or a date range containing none -- went
 * unmentioned. The sibling `IncomeTrendSection` empties for exactly the same
 * reasons and already pointed at /upload.
 */
describe('IncomeCategorySection empty state', () => {
  const renderEmpty = () =>
    render(
      <MemoryRouter>
        <IncomeCategorySection data={[]} totalIncome={0} onSelectCategory={() => {}} />
      </MemoryRouter>,
    )

  it('offers the action that can actually populate the chart', () => {
    renderEmpty()

    const action = screen.getByRole('link', { name: 'Upload Data' })
    expect(action).toHaveAttribute('href', '/upload')
    expect(screen.queryByRole('link', { name: 'Go to Settings' })).not.toBeInTheDocument()
  })

  it('never sends the user to Settings, which cannot change this breakdown', () => {
    // Broader than the label: any /settings destination here is the same defect.
    const { container } = renderEmpty()

    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('/settings')
    expect(container.textContent).not.toMatch(/Settings/)
  })

  it('names both real causes, not just the missing upload', () => {
    // A user who has uploaded and is looking at an empty FY needs the second
    // sentence; the first alone reads as "you have no data" and is wrong.
    renderEmpty()

    expect(screen.getByText(/Start by uploading your transaction data/)).toBeInTheDocument()
    expect(screen.getByText(/Widen the selected date range/)).toBeInTheDocument()
  })

  it('matches the sibling trend section wording for the shared cause', () => {
    // Both sections empty for the same reasons; divergent copy is how the
    // Settings pointer survived here after the sibling was fixed.
    renderEmpty()

    expect(screen.getByText('No income data available')).toBeInTheDocument()
  })
})

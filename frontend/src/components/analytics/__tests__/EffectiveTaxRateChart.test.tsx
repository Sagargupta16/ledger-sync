import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { useMotionStore } from '@/store/motionStore'

import EffectiveTaxRateChart from '../EffectiveTaxRateChart'
import { nearestCurveIncome } from '../effectiveTaxRateModel'

// Reduced motion paints the final geometry at once, so nothing waits on a frame.
beforeAll(() => useMotionStore.getState().setMode('reduced'))
afterAll(() => useMotionStore.getState().setMode('full'))

/** Keyboard inspection on the focused chart: the first ArrowRight opens row 0, each later one steps a row. */
function inspectRow(chart: HTMLElement, index: number) {
  chart.focus()
  for (let step = 0; step <= index; step++) fireEvent.keyDown(chart, { key: 'ArrowRight' })
}

/** The tooltip layer, the frame's only HTML child above the SVG. */
const tooltipOf = (chart: HTMLElement) => chart.querySelector('div[aria-hidden="true"]')

/** Regime curves that drew a path, in paint order. */
const drawnSeries = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-series]'))
    .filter((group) => group.querySelector('path')?.getAttribute('d')?.startsWith('M'))
    .map((group) => group.getAttribute('data-series'))

describe('historical effective tax chart', () => {
  it('removes the unavailable comparison when switching to FY 2019 and retains the old marker', () => {
    const { container, rerender } = render(
      <EffectiveTaxRateChart fyYear={2020} currentIncome={3_000_000} />,
    )
    const chart = screen.getByRole('img', { name: /for the new and old regimes/ })

    expect(drawnSeries(container)).toEqual(['oldRegimeRate', 'newRegimeRate'])
    // Row 60 of the default 50L range is the 30L income.
    inspectRow(chart, 60)
    expect(tooltipOf(chart)).toHaveTextContent('New Regime')
    expect(screen.getByRole('columnheader', { name: 'New regime effective rate' })).toBeInTheDocument()

    rerender(<EffectiveTaxRateChart fyYear={2019} currentIncome={3_000_000} />)

    expect(drawnSeries(container)).toEqual(['oldRegimeRate'])
    const tooltip = tooltipOf(chart)
    expect(tooltip).toHaveTextContent('Income: ₹30.0L')
    expect(tooltip).toHaveTextContent('Old Regime')
    expect(tooltip).toHaveTextContent('24.26%')
    expect(tooltip).not.toHaveTextContent('New Regime')
    expect(screen.queryByText('New Regime')).not.toBeInTheDocument()
    expect(screen.queryByText('Crossover')).not.toBeInTheDocument()
    expect(screen.getByText(/^Old regime at /)).toBeInTheDocument()
    expect(screen.getByText('You, old (24.26%)')).toBeInTheDocument()
    expect(container.querySelector('[data-marker="you"] circle')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /for the old regime, with your-income marker/ })).toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Annual income', 'Old regime effective rate',
    ])
    expect(Array.from(table.querySelectorAll('tbody tr')).every((row) => row.children.length === 2)).toBe(true)
  })

  it('retains a supplied old-regime estimate instead of replacing it with the full-year curve', () => {
    const { container } = render(
      <EffectiveTaxRateChart fyYear={2019} isNewRegime={false} currentIncome={3_000_000} currentTax={600_000} />,
    )

    expect(screen.getByText('You, old (20%)')).toBeInTheDocument()
    expect(screen.getByText(/^Old regime at /)).toBeInTheDocument()
    expect(container.querySelector('[data-marker="you"] circle')).toBeInTheDocument()
  })

  it('puts the marker on the curve row nearest the income', () => {
    const points = [0, 50_000, 100_000].map((income) => ({ income, oldRegimeRate: 0 }))

    expect(nearestCurveIncome(points, 70_000)).toBe(50_000)
    expect(nearestCurveIncome(points, 80_000)).toBe(100_000)
    expect(nearestCurveIncome([], 80_000)).toBeNull()
  })
})

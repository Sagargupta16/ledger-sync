/**
 * The Comparison page's category slope chart, rendered for real: the ten biggest categories by combined spend, a
 * hidden table beside the frame that matches the lines, rank markers, and arrow-key reading through the live region.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatCurrency } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

import { CategorySlopeChart } from '../components/CategorySlopeChart'
import type { CategoryDelta, PeriodSummary } from '../types'

const period = (label: string): PeriodSummary => ({
  label, income: 0, expense: 0, savings: 0, savingsRate: 0, transactions: 0, days: 365, isPartial: false, categories: {},
})
const delta = (category: string, periodA: number, periodB: number): CategoryDelta => ({
  category, periodA, periodB, change: 0, changeAbs: periodB - periodA, type: 'expense',
})

// Pets and Gifts have the least spend across both periods, so they stay off the chart.
const DELTAS = [
  delta('Rent', 240000, 240000), delta('Food', 90000, 120000), delta('Travel', 150000, 30000), delta('Shopping', 40000, 70000),
  delta('Bills', 50000, 52000), delta('Health', 20000, 45000), delta('Fuel', 30000, 28000), delta('Education', 25000, 25000),
  delta('Groceries', 22000, 26000), delta('Movies', 12000, 15000), delta('Pets', 4000, 6000), delta('Gifts', 0, 9000),
]

beforeEach(() => {
  // The panel reveal watches the viewport; the chart kit draws at once without an observer.
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  })
  // Reduced motion paints final geometry at once, so nothing waits on an animation frame.
  useMotionStore.getState().setMode('reduced')
})

afterEach(() => vi.unstubAllGlobals())

function renderChart() {
  render(<CategorySlopeChart deltas={DELTAS} periodA={period('FY 2024-25')} periodB={period('FY 2025-26')} />)
  return screen.getByRole('img', { name: /top 10 expense categories/i })
}

describe('CategorySlopeChart', () => {
  it('charts the ten biggest categories and tables them beside the frame in end order', () => {
    const chart = renderChart()
    expect(within(chart).queryByRole('table')).toBeNull()
    const rows = Array.from(screen.getByRole('table').querySelectorAll('tbody tr'), (row) =>
      Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent ?? ''))
    expect(rows.map(([name]) => name)).toEqual([
      'Rent', 'Food', 'Shopping', 'Bills', 'Health', 'Travel', 'Fuel', 'Groceries', 'Education', 'Movies',
    ])
    expect(rows[0]).toEqual(['Rent', formatCurrency(240000), formatCurrency(240000), 'no change', '1, unchanged'])
    expect(rows[4]).toEqual(['Health', formatCurrency(20000), formatCurrency(45000), `+${formatCurrency(25000)} (+125.0%)`, '9 to 5, up 4'])
    expect(rows[5][4]).toBe('2 to 6, down 4')
  })

  it('marks each rank move beside its end value with a hidden glyph', () => {
    const chart = renderChart()
    const marker = within(chart).getByText((_, element) => element?.tagName === 'tspan' && element.textContent === '▲+4')
    expect(marker.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(within(chart).getByText((_, element) => element?.tagName === 'tspan' && element.textContent === '▼-4')).toBeInTheDocument()
  })

  it('reads the items in end order from the keyboard and clears on Escape', () => {
    const chart = renderChart()
    const live = document.querySelector('[aria-live="polite"]')
    fireEvent.keyDown(chart, { key: 'ArrowDown' })
    expect(live?.textContent).toBe(
      `Rent: FY 2024-25 ${formatCurrency(240000)}, FY 2025-26 ${formatCurrency(240000)}, no change, rank 1, unchanged`,
    )
    fireEvent.keyDown(chart, { key: 'End' })
    expect(live?.textContent).toMatch(/^Movies: /)
    fireEvent.keyDown(chart, { key: 'ArrowUp' })
    expect(live?.textContent).toMatch(/^Education: .*, rank 7 to 9, down 2$/)
    fireEvent.keyDown(chart, { key: 'Escape' })
    expect(live?.textContent).toBe('')
  })
})

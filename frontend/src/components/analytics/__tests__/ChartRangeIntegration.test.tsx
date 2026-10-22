/**
 * Plot-only zoom through the DOM contract every long chart keeps: the range
 * controls above (presets, "N of M points"), the brush below, and a data table
 * that always lists every row. No chart library is mocked.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GrowthOverTimeChart } from '@/pages/investment-analytics/components/GrowthOverTimeChart'
import { NetWorthTrendChart } from '@/pages/net-worth/components/NetWorthTrendChart'
import ReturnsMonthlyChart from '@/pages/returns-analysis/components/ReturnsMonthlyChart'
import { addMonthsToMonthKey } from '@/lib/dateUtils'
import { useMotionStore } from '@/store/motionStore'

import StandardAreaChart from '../StandardAreaChart'

const HISTORY = Array.from({ length: 48 }, (_, index) => ({
  month: addMonthsToMonthKey('2022-01', index),
  date: `${addMonthsToMonthKey('2022-01', index)}-01`,
  income: index % 2 ? 0 : 1250.5,
  expenses: index % 2 ? 500.25 : 0,
  net: index % 2 ? -500.25 : 1250.5,
  cumulative: index * 375.125,
  netWorth: index * 375.125,
}))

beforeEach(() => {
  // Section reveals watch the viewport; the chart kit draws at once without an observer.
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  })
  // Reduced motion paints final geometry at once, so nothing waits on an animation frame.
  useMotionStore.getState().setMode('reduced')
})

afterEach(() => vi.unstubAllGlobals())

/** Every data-table row as cell text: the full series, whatever the plot shows. */
function tableRows(): string[][] {
  return Array.from(screen.getByRole('table').querySelectorAll('tbody tr')).map((row) =>
    Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent ?? ''),
  )
}

/** The range controls' reading, such as "12 of 48 points". */
const points = (text: string) => screen.getByText(new RegExp(text))

/** Picks a range preset, then lets the axis ticks it drops finish leaving (a zero-length exit ends on the next frame). */
async function pick(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
}

describe('long chart range integration', () => {
  it('shared area chart zooms the plot and the brush while the table keeps every row', async () => {
    render(
      <StandardAreaChart
        data={HISTORY}
        dataKey="month"
        areas={[{ key: 'net', color: '#123456', label: 'Net' }]}
        showBrush
        ariaLabel="Net cash flow"
      />,
    )
    const chart = screen.getByRole('img', { name: 'Net cash flow' })
    const start = screen.getByRole('slider', { name: 'Range start' })
    expect(points('48 of 48 points')).toBeInTheDocument()
    expect(start).toHaveAttribute('aria-valuenow', '0')
    // Month keys read as compact periods on the axis.
    expect(within(chart).getByText('Jan ’22')).toBeInTheDocument()
    const rows = tableRows()
    expect(rows).toHaveLength(48)
    expect(rows[0]).toEqual(['January 2022', '₹1,250.50'])

    await pick('1Y')
    expect(points('12 of 48 points')).toBeInTheDocument()
    expect(start).toHaveAttribute('aria-valuenow', '36')
    expect(start).toHaveAttribute('aria-valuetext', 'January 2025')
    expect(tableRows()).toEqual(rows)

    // Arrow-key inspection starts at the first month the zoomed plot shows.
    act(() => chart.focus())
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(screen.getByText('January 2025: Net ₹1,250.50')).toBeInTheDocument()

    await pick('Reset')
    expect(points('48 of 48 points')).toBeInTheDocument()
    expect(start).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByText('January 2022: Net ₹1,250.50')).toBeInTheDocument()
  })

  const pageCharts = [
    {
      name: 'monthly investment returns',
      node: () => <ReturnsMonthlyChart data={HISTORY} />,
    },
    {
      name: 'investment growth',
      node: () => <GrowthOverTimeChart isLoading={false} filteredGrowthData={HISTORY} />,
    },
    {
      name: 'net worth',
      node: () => (
        <NetWorthTrendChart
          isLoading={false}
          filteredNetWorthData={HISTORY}
          chartData={HISTORY}
          allCategories={[]}
          showStacked={false}
          setShowStacked={vi.fn()}
          showProjection={false}
          setShowProjection={vi.fn()}
          monthlyGrowth={0}
          anchor={null}
        />
      ),
    },
  ]

  it.each(pageCharts)('$name defaults to All and zoom keeps complete rows and financial values', async ({ node }) => {
    render(node())
    expect(points('48 of 48 points')).toBeInTheDocument()
    const rows = tableRows()
    expect(rows).toHaveLength(48)

    await pick('1Y')
    // Month keys read "January 2025", day keys "January 1, 2025".
    expect(points('January (1, )?2025 to December (1, )?2025 · 12 of 48 points')).toBeInTheDocument()
    expect(tableRows()).toEqual(rows)

    await pick('Reset')
    expect(points('48 of 48 points')).toBeInTheDocument()
  })

  it('net worth includes the complete history and forecast on first render', () => {
    const forecast = [
      ...HISTORY,
      { date: '2030-01-01', projected: 40000, netWorth: null },
      { date: '2031-01-01', projected: 45000, netWorth: null },
    ]
    render(
      <NetWorthTrendChart
        isLoading={false}
        filteredNetWorthData={HISTORY}
        chartData={forecast}
        allCategories={[]}
        showStacked={false}
        setShowStacked={vi.fn()}
        showProjection
        setShowProjection={vi.fn()}
        monthlyGrowth={300}
        anchor={null}
      />,
    )
    // The plotted range runs from the first recorded month to the last forecast point.
    expect(points('January 1, 2022 to January 1, 2031 · 50 of 50 points')).toBeInTheDocument()
    expect(tableRows()).toHaveLength(50)
  })
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MonthlyFlowDatum } from '@/hooks/useDashboardMetrics'
import { useMotionStore } from '@/store/motionStore'

const viewport = { mobile: false }

vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => viewport.mobile }))

const { default: MonthlyFlowChart } = await import('../MonthlyFlowChart')

const CHART = 'Monthly income versus spending bar chart'

const HISTORY: MonthlyFlowDatum[] = Array.from({ length: 47 }, (_, index) => {
  const month = new Date(Date.UTC(2022, 9 + index, 1))
  return {
    month: month.toISOString().slice(0, 7),
    label: month.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    income: 1000 + index,
    expense: 500 + index,
  }
})

function tableRows() {
  return screen.getByRole('table').querySelectorAll('tbody tr')
}

/** The plotted window, as the brush handles under the chart report it. */
function brushWindow(): [number, number] {
  const handle = (name: string) => Number(screen.getByRole('slider', { name }).getAttribute('aria-valuenow'))
  return [handle('Range start'), handle('Range end')]
}

/** Bars drawn in the plot: one per month and series. */
function plottedBars() {
  return screen.getByRole('img', { name: CHART }).querySelectorAll('path[fill]').length
}

beforeEach(() => {
  viewport.mobile = true
  useMotionStore.getState().setMode('reduced')
})

describe('MonthlyFlowChart range exploration', () => {
  it('opens on All and keeps all 47 source months in the chart and table', () => {
    render(<MonthlyFlowChart data={HISTORY} partialMonthLabel={null} />)

    expect(brushWindow()).toEqual([0, 46])
    expect(plottedBars()).toBe(94)
    expect(tableRows()).toHaveLength(47)
    const range = within(screen.getByRole('group', { name: 'Monthly chart range' }))
    expect(range.getByText(/October 2022 to August 2026/)).toBeInTheDocument()
    expect(range.getByText(/47 of 47 points/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Show later dates' })).toBeDisabled()
  })

  it('updates the visible range and count when the brush explores earlier history', async () => {
    render(<MonthlyFlowChart data={HISTORY} partialMonthLabel={null} />)
    const end = screen.getByRole('slider', { name: 'Range end' })

    // Three pages back from the last month, then one month forward: months 0 to 11.
    for (const key of ['PageDown', 'PageDown', 'PageDown', 'ArrowRight']) fireEvent.keyDown(end, { key })

    expect(screen.getByText(/October 2022 to September 2023/)).toBeInTheDocument()
    expect(screen.getByText(/12 of 47 points/)).toBeInTheDocument()
    expect(brushWindow()).toEqual([0, 11])
    await waitFor(() => expect(plottedBars()).toBe(24))
    expect(tableRows()).toHaveLength(47)
    expect(screen.getByRole('button', { name: 'Show earlier dates' })).toBeDisabled()
  })

  it('lets touch and keyboard users page through history without moving past either end', async () => {
    render(<MonthlyFlowChart data={HISTORY} partialMonthLabel={null} />)
    fireEvent.click(screen.getByRole('button', { name: '1Y' }))
    const earlier = screen.getByRole('button', { name: 'Show earlier dates' })
    const later = screen.getByRole('button', { name: 'Show later dates' })

    fireEvent.click(earlier)
    expect(brushWindow()).toEqual([23, 34])
    fireEvent.click(later)
    expect(brushWindow()).toEqual([35, 46])
    for (let index = 0; index < 8; index++) fireEvent.click(earlier)
    expect(brushWindow()).toEqual([0, 11])
    expect(earlier).toBeDisabled()
    expect(later).toBeEnabled()
    await waitFor(() => expect(plottedBars()).toBe(24))
    expect(tableRows()).toHaveLength(47)
  })

  it('resets the window to All when the supplied date domain changes', async () => {
    const { rerender } = render(<MonthlyFlowChart data={HISTORY} partialMonthLabel={null} />)
    fireEvent.click(screen.getByRole('button', { name: '1Y' }))
    expect(brushWindow()).toEqual([35, 46])

    rerender(<MonthlyFlowChart data={HISTORY.slice(0, 12)} partialMonthLabel={null} />)

    expect(brushWindow()).toEqual([0, 11])
    expect(screen.getByText(/12 of 12 points/)).toBeInTheDocument()
    await waitFor(() => expect(plottedBars()).toBe(24))
    expect(tableRows()).toHaveLength(12)
  })

  it('provides the same All default and presets on desktop', () => {
    viewport.mobile = false
    render(<MonthlyFlowChart data={HISTORY} partialMonthLabel={null} />)

    expect(brushWindow()).toEqual([0, 46])
    expect(screen.getByRole('group', { name: 'Monthly chart range' })).toBeInTheDocument()
    expect(plottedBars()).toBe(94)
    expect(tableRows()).toHaveLength(47)
  })

  it('shows every month directly when six or fewer months are selected', () => {
    render(<MonthlyFlowChart data={HISTORY.slice(0, 6)} partialMonthLabel={null} />)

    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Monthly chart range' })).not.toBeInTheDocument()
    expect(plottedBars()).toBe(12)
    expect(tableRows()).toHaveLength(6)
  })
})

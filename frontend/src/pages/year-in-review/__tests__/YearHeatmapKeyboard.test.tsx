import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMotionStore } from '@/store/motionStore'

import YearHeatmapSection from '../components/YearHeatmapSection'
import { buildDayCells, deriveMonthLabels } from '../heatmapUtils'

type Review = React.ComponentProps<typeof YearHeatmapSection>['review']

// January 2020 opens on a Wednesday (week 0, day 3) and is long past, so every
// cell is enabled. A 1,000 peak puts these four days on levels 4, 3, 2 and 1.
const SPENDING: Record<string, number> = {
  '2020-01-02': 1000,
  '2020-01-03': 500,
  '2020-01-07': 250,
  '2020-01-06': 100,
}

function makeReview(): Review {
  const { cells, mxE } = buildDayCells(new Date(2020, 0, 1), new Date(2020, 0, 31), SPENDING, {})
  return {
    mode: 'expense',
    grid: cells,
    modeMax: mxE,
    periodLabel: '2020',
    monthLabels: deriveMonthLabels(cells),
    hoveredDay: null,
    setHoveredDay: vi.fn(),
    stats: {
      monthlyExpense: Array.from({ length: 12 }, () => 0),
      monthlyIncome: Array.from({ length: 12 }, () => 0),
    },
  } as unknown as Review
}

function renderHeatmap() {
  const { container } = render(<YearHeatmapSection review={makeReview()} />)
  const cell = (date: string) => {
    const found = container.querySelector<HTMLButtonElement>(`[data-cell-date="${date}"]`)
    if (!found) throw new Error(`no cell for ${date}`)
    return found
  }
  const live = container.querySelector('[aria-live="polite"]')
  if (!live) throw new Error('no live region')
  return { container, cell, live }
}

/** Presses `key` on the focused cell and returns the date focus lands on. */
function press(key: string): string | undefined {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) throw new Error('nothing focused')
  fireEvent.keyDown(active, { key })
  return document.activeElement instanceof HTMLElement
    ? document.activeElement.dataset.cellDate
    : undefined
}

afterEach(() => {
  useMotionStore.setState({ mode: 'full' })
})

describe('Year heatmap keyboard', () => {
  it('moves a week with Left and Right, a day with Up and Down, and jumps with Home and End', () => {
    const { container, cell } = renderHeatmap()
    act(() => cell('2020-01-08').focus())

    expect(press('ArrowRight')).toBe('2020-01-15')
    expect(press('ArrowLeft')).toBe('2020-01-08')
    expect(press('ArrowDown')).toBe('2020-01-09')
    expect(press('ArrowUp')).toBe('2020-01-08')
    expect(press('Home')).toBe('2020-01-01')
    expect(press('End')).toBe('2020-01-31')

    // Roving tabindex: the grid stays one tab stop, on the day focus reached.
    const stops = container.querySelectorAll('[tabindex="0"]')
    expect(stops).toHaveLength(1)
    expect(stops[0]).toHaveAttribute('data-cell-date', '2020-01-31')
  })

  it('selects a day with Enter, Space or a tap, and Escape clears the selection before the highlight', () => {
    const { container, cell, live } = renderHeatmap()

    fireEvent.keyDown(cell('2020-01-03'), { key: 'Enter' })
    expect(cell('2020-01-03').getAttribute('aria-label')).toMatch(/, selected$/)
    // The existing day detail opens on the selected day.
    expect(screen.getByText('Fri, Jan 3, 2020')).toBeInTheDocument()
    expect(live).toHaveTextContent(/^Selected Friday, January 3, 2020: .*500.* spent/)

    fireEvent.keyDown(cell('2020-01-06'), { key: ' ' })
    expect(cell('2020-01-06').getAttribute('aria-label')).toMatch(/, selected$/)
    expect(cell('2020-01-03').getAttribute('aria-label')).not.toMatch(/selected/)

    fireEvent.click(cell('2020-01-07'))
    expect(screen.getByText('Tue, Jan 7, 2020')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Highlight days with high spending' }))
    fireEvent.keyDown(cell('2020-01-07'), { key: 'Escape' })
    expect(live).toHaveTextContent('Selection cleared')
    expect(cell('2020-01-07').getAttribute('aria-label')).not.toMatch(/selected/)
    expect(screen.queryByText('Tue, Jan 7, 2020')).not.toBeInTheDocument()
    expect(cell('2020-01-03')).toHaveAttribute('data-highlight', 'match')

    fireEvent.keyDown(cell('2020-01-07'), { key: 'Escape' })
    expect(live).toHaveTextContent('Highlight cleared')
    expect(container.querySelector('[data-highlight]')).toBeNull()
  })
})

describe('Year heatmap legend', () => {
  it('toggles a level highlight from native pressed buttons', () => {
    const { container, cell, live } = renderHeatmap()
    const high = screen.getByRole('button', { name: 'Highlight days with high spending' })
    const none = screen.getByRole('button', { name: 'Highlight days with no activity' })
    expect(high).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(high)
    expect(high).toHaveAttribute('aria-pressed', 'true')
    expect(cell('2020-01-03')).toHaveAttribute('data-highlight', 'match')
    expect(cell('2020-01-02')).toHaveAttribute('data-highlight', 'dim')
    expect(cell('2020-01-10')).toHaveAttribute('data-highlight', 'dim')
    expect(live).toHaveTextContent('1 day with high spending highlighted')

    fireEvent.click(none)
    expect(high).toHaveAttribute('aria-pressed', 'false')
    expect(none).toHaveAttribute('aria-pressed', 'true')
    expect(cell('2020-01-10')).toHaveAttribute('data-highlight', 'match')
    expect(cell('2020-01-03')).toHaveAttribute('data-highlight', 'dim')
    expect(live).toHaveTextContent('27 days with no activity highlighted')

    // Pressing the active swatch again clears it.
    fireEvent.click(none)
    expect(none).toHaveAttribute('aria-pressed', 'false')
    expect(container.querySelector('[data-highlight]')).toBeNull()
    expect(live).toHaveTextContent('Highlight cleared, showing every day')
  })
})

describe('Year heatmap live region', () => {
  it('reads the focused day out politely as focus moves', () => {
    const { cell, live } = renderHeatmap()
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toBeEmptyDOMElement()

    act(() => cell('2020-01-02').focus())
    expect(live).toHaveTextContent(/^Thursday, January 2, 2020: .*1,000.* spent, .* earned, .* net deficit$/)

    press('ArrowDown')
    expect(live).toHaveTextContent(/^Friday, January 3, 2020: /)

    press('ArrowRight')
    expect(live).toHaveTextContent('Friday, January 10, 2020: no activity')
  })
})

describe('Year heatmap motion', () => {
  it('retints week by week, left to right, in Full mode', () => {
    const { cell } = renderHeatmap()
    const delay = (date: string) => Number.parseFloat(cell(date).style.transitionDelay)

    expect(delay('2020-01-01')).toBe(0)
    expect(delay('2020-01-15')).toBeGreaterThan(0)
    expect(delay('2020-01-29')).toBeGreaterThan(delay('2020-01-15'))
  })

  it('paints the final colours at once in Reduced mode', () => {
    useMotionStore.setState({ mode: 'reduced' })
    const { cell } = renderHeatmap()

    expect(cell('2020-01-29').style.transitionProperty).toBe('')
    expect(cell('2020-01-29').style.transitionDelay).toBe('')
  })
})

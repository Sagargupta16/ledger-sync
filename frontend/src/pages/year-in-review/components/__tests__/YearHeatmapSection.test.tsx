import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import YearHeatmapSection from '../YearHeatmapSection'
import type { DayCell } from '../DayOfWeekChart'

function makeCell(date: string, dayOfWeek: number, weekIndex: number): DayCell {
  return {
    date,
    expense: 0,
    income: 0,
    net: 0,
    dayOfWeek,
    weekIndex,
    month: 0,
    isToday: false,
    hasTx: false,
  }
}

function makeReview(grid: DayCell[]) {
  return {
    mode: 'expense',
    grid,
    modeMax: 0,
    isFYMode: false,
    currentFY: 'FY 2020-21',
    selectedYear: 2020,
    monthLabels: [],
    hoveredDay: null,
    setHoveredDay: vi.fn(),
    stats: {
      monthlyExpense: Array.from({ length: 12 }, () => 0),
      monthlyIncome: Array.from({ length: 12 }, () => 0),
    },
  } as unknown as React.ComponentProps<typeof YearHeatmapSection>['review']
}

describe('YearHeatmapSection keyboard navigation', () => {
  it('moves by keyboard and restores one tab stop after a period change', async () => {
    const firstReview = makeReview([
      makeCell('2020-01-01', 3, 0),
      makeCell('2020-01-08', 3, 1),
    ])
    const { container, rerender } = render(
      <YearHeatmapSection review={firstReview} />,
    )

    const firstDay = container.querySelector<HTMLButtonElement>(
      '[data-cell-date="2020-01-01"]',
    )
    const nextWeek = container.querySelector<HTMLButtonElement>(
      '[data-cell-date="2020-01-08"]',
    )
    expect(firstDay).not.toBeNull()
    expect(nextWeek).not.toBeNull()

    fireEvent.keyDown(firstDay!, { key: 'ArrowRight' })

    await waitFor(() => expect(nextWeek).toHaveFocus())
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
    expect(nextWeek).toHaveAttribute('tabindex', '0')

    const nextReview = makeReview([
      makeCell('2021-01-01', 5, 0),
      makeCell('2021-01-08', 5, 1),
    ])
    rerender(<YearHeatmapSection review={nextReview} />)

    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
    expect(
      container.querySelector('[data-cell-date="2021-01-01"]'),
    ).toHaveAttribute('tabindex', '0')
  })
})

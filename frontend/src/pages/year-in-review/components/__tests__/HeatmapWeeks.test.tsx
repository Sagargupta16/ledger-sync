import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { DayCell } from '../DayOfWeekChart'
import HeatmapWeeks from '../HeatmapWeeks'

function makeCell(date: string, dayOfWeek: number, weekIndex = 0): DayCell {
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

describe('HeatmapWeeks', () => {
  it('keeps one tabbable day when the selected period changes', () => {
    const firstGrid = [
      makeCell('2020-01-01', 3),
      makeCell('2020-01-02', 4),
      makeCell('2020-01-03', 5),
    ]
    const { container, rerender } = render(
      <HeatmapWeeks
        grid={firstGrid}
        mode="expense"
        modeMax={0}
        keyboardDate="2020-01-02"
      />,
    )

    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
    expect(
      container.querySelector('[data-cell-date="2020-01-02"]'),
    ).toHaveAttribute('tabindex', '0')

    const nextGrid = [
      makeCell('2021-01-01', 5),
      makeCell('2021-01-02', 6),
      makeCell('2021-01-03', 0, 1),
    ]
    rerender(
      <HeatmapWeeks
        grid={nextGrid}
        mode="expense"
        modeMax={0}
        keyboardDate="2020-01-02"
      />,
    )

    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
    expect(
      container.querySelector('[data-cell-date="2021-01-01"]'),
    ).toHaveAttribute('tabindex', '0')
  })
})

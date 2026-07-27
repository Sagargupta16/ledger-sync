import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import HeatmapCell from '../HeatmapCell'
import type { DayCell } from '../DayOfWeekChart'

const cell = (date: string, expense: number, income: number): DayCell => ({
  date,
  expense,
  income,
  net: income - expense,
  dayOfWeek: 1,
  weekIndex: 0,
  month: 0,
  isToday: false,
  hasTx: expense > 0 || income > 0,
})

function renderCell(day: DayCell) {
  const { container } = render(<HeatmapCell cell={day} mode="net" modeMax={50_000} />)
  return container.querySelector<HTMLElement>(`[data-cell-date="${day.date}"]`)
}

describe('HeatmapCell in net mode', () => {
  it('paints an equal-magnitude deficit and surplus in different hues', () => {
    const deficit = renderCell(cell('2026-01-02', 50_000, 0))
    const surplus = renderCell(cell('2026-01-03', 0, 50_000))

    expect(deficit?.style.backgroundColor).toBeTruthy()
    expect(deficit?.style.backgroundColor).not.toBe(surplus?.style.backgroundColor)
  })

  it('labels a deficit day as a deficit, never as savings', () => {
    renderCell(cell('2026-01-02', 50_000, 0))
    const label = screen.getByRole('button').getAttribute('aria-label') ?? ''

    expect(label).toContain('net deficit')
    expect(label).not.toMatch(/saving|surplus|earned/i)
  })

  it('labels a surplus day as a surplus', () => {
    renderCell(cell('2026-01-03', 0, 50_000))
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('net surplus')
  })

  it('still reads a no-activity day as no activity', () => {
    renderCell(cell('2026-01-04', 0, 0))
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('2026-01-04: no activity')
  })
})

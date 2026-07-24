import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import DayCell from '../DayCell'

const BASE_PROPS = {
  year: 2026,
  month: 6,
  bills: [],
  maxBillAmount: 0,
  isToday: false,
  isSelected: false,
}

describe('DayCell', () => {
  it('disables adjacent-month dates instead of exposing dead controls', () => {
    const onClick = vi.fn()
    render(
      <DayCell
        {...BASE_PROPS}
        month={5}
        day={30}
        isCurrentMonth={false}
        onClick={onClick}
      />,
    )

    const day = screen.getByRole('button', { name: /outside the current month/i })
    expect(day).toBeDisabled()

    fireEvent.click(day)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('keeps current-month dates actionable with a complete date label', () => {
    const onClick = vi.fn()
    render(
      <DayCell
        {...BASE_PROPS}
        day={14}
        isCurrentMonth
        onClick={onClick}
      />,
    )

    const day = screen.getByRole('button', { name: /14 July 2026, no bills/i })
    expect(day).toBeEnabled()

    fireEvent.click(day)
    expect(onClick).toHaveBeenCalledOnce()
  })
})

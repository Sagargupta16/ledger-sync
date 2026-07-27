import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import MobileMonthlySummary from '../MobileMonthlySummary'

const MONTHLY_EXPENSE = [1200, 900, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const MONTHLY_INCOME = [3000, 2800, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

describe('MobileMonthlySummary', () => {
  it('selects a month through an accessible button', () => {
    const onSelectMonth = vi.fn()

    const { rerender } = render(
      <MobileMonthlySummary
        mode="expense"
        monthlyExpense={MONTHLY_EXPENSE}
        monthlyIncome={MONTHLY_INCOME}
        selectedMonth={null}
        onSelectMonth={onSelectMonth}
      />,
    )

    const january = screen.getByRole('button', { name: /Jan:.*Show monthly details/i })
    expect(january).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(january)
    expect(onSelectMonth).toHaveBeenCalledWith(0)

    rerender(
      <MobileMonthlySummary
        mode="expense"
        monthlyExpense={MONTHLY_EXPENSE}
        monthlyIncome={MONTHLY_INCOME}
        selectedMonth={0}
        onSelectMonth={onSelectMonth}
      />,
    )
    expect(january).toHaveAttribute('aria-pressed', 'true')
  })

  it('distinguishes a deficit month from an equal-magnitude surplus month', () => {
    // Jan nets +30,000 and Feb nets -30,000. Sign-blind encoding painted both
    // tiles identically on a heatmap legended "Savings".
    const expense = [1_000, 40_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const income = [31_000, 10_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

    render(
      <MobileMonthlySummary
        mode="net"
        monthlyExpense={expense}
        monthlyIncome={income}
        selectedMonth={null}
        onSelectMonth={vi.fn()}
      />,
    )

    const surplus = screen.getByRole('button', { name: /^Jan:/ })
    const deficit = screen.getByRole('button', { name: /^Feb:/ })

    expect(surplus.style.backgroundColor).not.toBe(deficit.style.backgroundColor)
    expect(deficit.getAttribute('aria-label')).toContain('net deficit')
    expect(deficit.getAttribute('aria-label')).not.toMatch(/saving|surplus/i)
    expect(surplus.getAttribute('aria-label')).toContain('net surplus')
  })
})

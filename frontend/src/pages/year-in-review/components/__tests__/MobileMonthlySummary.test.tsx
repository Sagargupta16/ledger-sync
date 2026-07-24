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
})

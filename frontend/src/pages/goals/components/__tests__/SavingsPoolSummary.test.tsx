import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { formatCurrencyCompact } from '@/lib/formatters'

import SavingsPoolSummary from '../SavingsPoolSummary'

describe('SavingsPoolSummary', () => {
  it('stacks currency figures on mobile before switching to three columns', () => {
    const { container } = render(
      <SavingsPoolSummary
        netSavings={12_345_678}
        totalAllocated={9_876_543}
        goals={[]}
        effectiveAmounts={{}}
      />,
    )

    const summaryGrid = container.querySelector('.grid')

    expect(summaryGrid).toHaveClass('grid-cols-1', 'sm:grid-cols-3')
    expect(screen.getByText(formatCurrencyCompact(12_345_678))).toBeInTheDocument()
    expect(screen.getByText(formatCurrencyCompact(9_876_543))).toBeInTheDocument()
    expect(
      screen.getByText(formatCurrencyCompact(12_345_678 - 9_876_543)),
    ).toBeInTheDocument()
  })
})

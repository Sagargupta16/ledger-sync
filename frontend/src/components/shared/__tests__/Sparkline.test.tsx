import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Sparkline from '../Sparkline'

describe('Sparkline', () => {
  it('exposes a useful chart label', () => {
    render(<Sparkline data={[10, 18, 14, 24]} ariaLabel="Cash balance trend" />)

    expect(
      screen.getByRole('img', { name: 'Cash balance trend' }),
    ).toBeInTheDocument()
  })

  it('uses flat paths without gradients, filters, or draw animations', () => {
    const { container } = render(
      <Sparkline data={[10, 18, 14, 24]} ariaLabel="Cash balance trend" />,
    )

    expect(container.querySelector('linearGradient, filter')).toBeNull()
    expect(container.querySelector('[pathLength]')).toBeNull()
  })
})

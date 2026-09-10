import { cloneElement, type ComponentProps, type ReactElement } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/useChartPresentation', () => ({
  useChartPresentation: () => ({ animate: false, isMobile: false }),
}))

// Give the real SVG a size in jsdom and activate the 30L point's real tooltip.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: {
      readonly children: ReactElement<{ width: number; height: number }>
    }) => cloneElement(children, { width: 640, height: 320 }),
    Tooltip: (props: ComponentProps<typeof actual.Tooltip>) => (
      <actual.Tooltip {...props} active defaultIndex={60} isAnimationActive={false} />
    ),
  }
})

const { default: EffectiveTaxRateChart } = await import('../EffectiveTaxRateChart')

describe('historical effective tax chart', () => {
  it('removes the unavailable comparison when switching to FY 2019 and retains the old marker', async () => {
    const { container, rerender } = render(
      <EffectiveTaxRateChart fyYear={2020} currentIncome={3_000_000} />,
    )

    await waitFor(() => {
      expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(2)
      expect(container.querySelector('.recharts-tooltip-wrapper')).toHaveTextContent('New Regime')
    })
    expect(screen.getByRole('columnheader', { name: 'New regime effective rate' })).toBeInTheDocument()

    rerender(<EffectiveTaxRateChart fyYear={2019} currentIncome={3_000_000} />)

    await waitFor(() => {
      expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(1)
      const tooltip = container.querySelector('.recharts-tooltip-wrapper')
      expect(tooltip).toHaveTextContent('Old Regime')
      expect(tooltip).toHaveTextContent('24.26%')
      expect(tooltip).not.toHaveTextContent('New Regime')
    })
    expect(screen.queryByText('New Regime')).not.toBeInTheDocument()
    expect(screen.queryByText('Crossover')).not.toBeInTheDocument()
    expect(screen.getByText(/^Old regime at /)).toBeInTheDocument()
    expect(screen.getByText('You, old (24.26%)')).toBeInTheDocument()
    expect(container.querySelector('.recharts-reference-dot-dot')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /for the old regime, with your-income marker/ })).toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Annual income', 'Old regime effective rate',
    ])
    expect(Array.from(table.querySelectorAll('tbody tr')).every((row) => row.children.length === 2)).toBe(true)
  })

  it('retains a supplied old-regime estimate instead of replacing it with the full-year curve', async () => {
    const { container } = render(
      <EffectiveTaxRateChart fyYear={2019} isNewRegime={false} currentIncome={3_000_000} currentTax={600_000} />,
    )

    expect(screen.getByText('You, old (20%)')).toBeInTheDocument()
    expect(screen.getByText(/^Old regime at /)).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelector('.recharts-reference-dot-dot')).toBeInTheDocument()
    })
  })
})

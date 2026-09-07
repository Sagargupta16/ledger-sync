import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import TaxYearChart from '../TaxYearChart'
import type { TaxPlanningModel } from '../../useTaxPlanning'

const rechartsProbe = vi.hoisted(() => ({
  rightAxisProps: null as Record<string, unknown> | null,
}))

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  const Passthrough = ({ children }: { children?: ReactNode }) => children
  const Empty = () => null

  return {
    ...actual,
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    CartesianGrid: Empty,
    XAxis: Empty,
    YAxis: (props: Record<string, unknown>) => {
      if (props.yAxisId === 'right') rechartsProbe.rightAxisProps = props
      return null
    },
    Tooltip: Empty,
    Bar: Empty,
    Line: Empty,
  }
})

const planning = {
  fyList: ['FY 2025-26', 'FY 2024-25'],
  transactionsByFY: {},
  multiYearProjections: [
    { fy: '2024-25', totalTax: 200_000 },
    { fy: '2025-26', totalTax: 300_000 },
  ],
  currentFYLabel: 'FY 2025-26',
  regimeOverride: null,
  preferredRegime: 'new',
  salaryIsNetOfTds: true,
} as TaxPlanningModel

describe('TaxYearChart', () => {
  it('keeps the cumulative right scale compact and accessible at 320px', () => {
    const originalWidth = globalThis.window.innerWidth
    Object.defineProperty(globalThis.window, 'innerWidth', { value: 320, configurable: true })

    try {
      render(<TaxYearChart planning={planning} />)

      expect(
        screen.getByRole('img', {
          name: /Cumulative tax uses the right scale from ₹0 to ₹5,00,000/,
        }),
      ).toBeInTheDocument()

      const scale = screen.getByText('Cumulative: ₹0-₹5.0L')
      expect(scale).toHaveClass('min-w-0', 'truncate')
      expect(scale.parentElement).toHaveClass('min-w-0', 'max-w-full')
      expect(rechartsProbe.rightAxisProps).toMatchObject({
        width: 0,
        hide: true,
        domain: [0, 500_000],
      })
    } finally {
      Object.defineProperty(globalThis.window, 'innerWidth', {
        value: originalWidth,
        configurable: true,
      })
    }
  })
})

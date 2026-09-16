import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addMonthsToMonthKey } from '@/lib/dateUtils'

const captured: {
  data: readonly Record<string, unknown>[]
  range?: { startIndex: number; endIndex: number }
  tickFormatter?: (value: string) => string
} = { data: [] }

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const Passthrough = ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>
  const Chart = ({ children, data }: { readonly children?: ReactNode; readonly data: typeof captured.data }) => {
    captured.data = data
    return <svg>{children}</svg>
  }
  return {
    ...actual,
    ResponsiveContainer: Passthrough,
    AreaChart: Chart,
    ComposedChart: Chart,
    Brush: (props: NonNullable<typeof captured.range>) => { captured.range = props; return null },
    XAxis: (props: { tickFormatter?: typeof captured.tickFormatter }) => { captured.tickFormatter = props.tickFormatter; return null },
    YAxis: () => null,
    Tooltip: () => null,
    Area: () => null,
    Line: () => null,
    Bar: () => null,
    CartesianGrid: () => null,
    ReferenceLine: () => null,
  }
})

const { default: StandardAreaChart } = await import('../StandardAreaChart')
const { default: ReturnsMonthlyChart } = await import('@/pages/returns-analysis/components/ReturnsMonthlyChart')
const { GrowthOverTimeChart } = await import('@/pages/investment-analytics/components/GrowthOverTimeChart')
const { NetWorthTrendChart } = await import('@/pages/net-worth/components/NetWorthTrendChart')

const HISTORY = Array.from({ length: 48 }, (_, index) => ({
  month: addMonthsToMonthKey('2022-01', index),
  date: `${addMonthsToMonthKey('2022-01', index)}-01`,
  income: index % 2 ? 0 : 1250.5,
  expenses: index % 2 ? 500.25 : 0,
  net: index % 2 ? -500.25 : 1250.5,
  cumulative: index * 375.125,
  netWorth: index * 375.125,
}))

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  })
  captured.data = []
  captured.range = undefined
  captured.tickFormatter = undefined
})

afterEach(() => vi.unstubAllGlobals())

describe('long chart range integration', () => {
  const charts = [
    {
      name: 'shared area chart',
      node: () => <StandardAreaChart data={HISTORY} dataKey="month" areas={[{ key: 'net', color: '#123456' }]} showBrush />,
    },
    {
      name: 'monthly investment returns',
      node: () => <ReturnsMonthlyChart data={HISTORY} />,
    },
    {
      name: 'investment growth',
      node: () => <GrowthOverTimeChart isLoading={false} filteredGrowthData={HISTORY} />,
    },
    {
      name: 'net worth',
      node: () => (
        <NetWorthTrendChart
          isLoading={false}
          filteredNetWorthData={HISTORY}
          chartData={HISTORY}
          allCategories={[]}
          showStacked={false}
          setShowStacked={vi.fn()}
          showProjection={false}
          setShowProjection={vi.fn()}
          monthlyGrowth={0}
          anchor={null}
        />
      ),
    },
  ]

  it.each(charts)('$name defaults to All and zoom keeps complete rows and financial values', ({ node }) => {
    render(node())
    expect(captured.range).toMatchObject({ startIndex: 0, endIndex: 47 })
    expect(captured.data).toHaveLength(48)
    expect(captured.tickFormatter?.('2026-01')).toBe('Jan ’26')
    const originalValues = captured.data.map((row) => [row.net, row.cumulative, row.netWorth])
    const tableRows = screen.getByRole('table').querySelectorAll('tbody tr')
    expect(tableRows).toHaveLength(48)

    fireEvent.click(screen.getByRole('button', { name: '1Y' }))
    expect(captured.range).toMatchObject({ startIndex: 36, endIndex: 47 })
    expect(captured.data.map((row) => [row.net, row.cumulative, row.netWorth])).toEqual(originalValues)
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(48)

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(captured.range).toMatchObject({ startIndex: 0, endIndex: 47 })
  })

  it('net worth includes the complete history and forecast on first render', () => {
    const forecast = [
      ...HISTORY,
      { date: '2030-01-01', projected: 40000, netWorth: null },
      { date: '2031-01-01', projected: 45000, netWorth: null },
    ]
    render(
      <NetWorthTrendChart
        isLoading={false}
        filteredNetWorthData={HISTORY}
        chartData={forecast}
        allCategories={[]}
        showStacked={false}
        setShowStacked={vi.fn()}
        showProjection
        setShowProjection={vi.fn()}
        monthlyGrowth={300}
        anchor={null}
      />,
    )
    expect(captured.range).toMatchObject({ startIndex: 0, endIndex: 49 })
    expect(captured.data[0].date).toBe('2022-01-01')
    expect(captured.data.at(-1)?.date).toBe('2031-01-01')
  })
})

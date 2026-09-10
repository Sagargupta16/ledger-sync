import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MonthlyFlowDatum } from '@/hooks/useDashboardMetrics'

type Range = { startIndex?: number; endIndex?: number }
const captured: {
  mobile: boolean
  data: readonly MonthlyFlowDatum[]
  brush?: Range & { onChange?: (range: Range) => void }
} = { mobile: false, data: [] }

vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => captured.mobile }))

// jsdom cannot measure the plot. Capture the real chart/brush boundary while
// leaving the range controls and full accessible table mounted.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const Passthrough = ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>
  return {
    ...actual,
    ResponsiveContainer: Passthrough,
    BarChart: ({ data, children }: {
      readonly data: readonly MonthlyFlowDatum[]
      readonly children?: ReactNode
    }) => {
      captured.data = data
      return <div>{children}</div>
    },
    Brush: (props: NonNullable<typeof captured.brush>) => {
      captured.brush = props
      return null
    },
    Bar: Passthrough,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  }
})

const { default: MonthlyFlowChart } = await import('../MonthlyFlowChart')

const HISTORY: MonthlyFlowDatum[] = Array.from({ length: 47 }, (_, index) => {
  const month = new Date(Date.UTC(2022, 9 + index, 1))
  return {
    month: month.toISOString().slice(0, 7),
    label: month.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    income: 1000 + index,
    expense: 500 + index,
  }
})

function tableRows() {
  return screen.getByRole('table').querySelectorAll('tbody tr')
}

beforeEach(() => {
  captured.mobile = true
  captured.data = []
  captured.brush = undefined
})

describe('MonthlyFlowChart mobile exploration', () => {
  it('opens on six recent months and keeps all 47 source months in the chart and table', () => {
    render(<MonthlyFlowChart data={HISTORY} partialMonthLabel={null} />)

    expect(captured.brush).toMatchObject({ startIndex: 41, endIndex: 46 })
    expect(captured.data).toBe(HISTORY)
    expect(tableRows()).toHaveLength(47)
    const range = within(screen.getByRole('group', { name: 'Monthly chart range' }))
    expect(range.getByText('Mar 26 to Aug 26')).toBeInTheDocument()
    expect(range.getByText('Showing 6 of 47 months')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show later months' })).toBeDisabled()
  })

  it('updates the visible range and count when the brush explores earlier history', () => {
    render(<MonthlyFlowChart data={HISTORY} partialMonthLabel={null} />)

    act(() => captured.brush?.onChange?.({ startIndex: 0, endIndex: 11 }))

    expect(screen.getByText('Oct 22 to Sept 23')).toBeInTheDocument()
    expect(screen.getByText('Showing 12 of 47 months')).toBeInTheDocument()
    expect(captured.brush).toMatchObject({ startIndex: 0, endIndex: 11 })
    expect(tableRows()).toHaveLength(47)
    expect(screen.getByRole('button', { name: 'Show earlier months' })).toBeDisabled()
  })

  it('lets touch and keyboard users page through history without moving past either end', () => {
    render(<MonthlyFlowChart data={HISTORY} partialMonthLabel={null} />)
    const earlier = screen.getByRole('button', { name: 'Show earlier months' })
    const later = screen.getByRole('button', { name: 'Show later months' })

    fireEvent.click(earlier)
    expect(captured.brush).toMatchObject({ startIndex: 35, endIndex: 40 })
    fireEvent.click(later)
    expect(captured.brush).toMatchObject({ startIndex: 41, endIndex: 46 })
    for (let index = 0; index < 8; index++) fireEvent.click(earlier)
    expect(captured.brush).toMatchObject({ startIndex: 0, endIndex: 5 })
    expect(earlier).toBeDisabled()
    expect(later).toBeEnabled()
    expect(tableRows()).toHaveLength(47)
  })

  it('resets the window to the latest months when the selected period changes', () => {
    const { rerender } = render(<MonthlyFlowChart data={HISTORY} partialMonthLabel={null} />)
    act(() => captured.brush?.onChange?.({ startIndex: 0, endIndex: 5 }))

    rerender(<MonthlyFlowChart data={HISTORY.slice(0, 12)} partialMonthLabel={null} />)

    expect(captured.brush).toMatchObject({ startIndex: 6, endIndex: 11 })
    expect(screen.getByText('Showing 6 of 12 months')).toBeInTheDocument()
    expect(tableRows()).toHaveLength(12)
  })

  it('retains the full desktop plot without mobile range controls', () => {
    captured.mobile = false
    render(<MonthlyFlowChart data={HISTORY} partialMonthLabel={null} />)

    expect(captured.brush).toBeUndefined()
    expect(screen.queryByRole('group', { name: 'Monthly chart range' })).not.toBeInTheDocument()
    expect(captured.data).toBe(HISTORY)
    expect(tableRows()).toHaveLength(47)
  })

  it('shows every month directly when six or fewer months are selected', () => {
    render(<MonthlyFlowChart data={HISTORY.slice(0, 6)} partialMonthLabel={null} />)

    expect(captured.brush).toBeUndefined()
    expect(screen.queryByRole('group', { name: 'Monthly chart range' })).not.toBeInTheDocument()
    expect(tableRows()).toHaveLength(6)
  })
})

import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { addMonthsToMonthKey } from '@/lib/dateUtils'
import ChartRangeControls from '../ChartRangeControls'
import { useChartRange } from '../useChartRange'

const MONTHS = Array.from({ length: 48 }, (_, index) => addMonthsToMonthKey('2022-01', index))

function Example({ dates = MONTHS }: { readonly dates?: string[] }) {
  const range = useChartRange(dates)
  return <ChartRangeControls range={range} />
}

describe('shared chart range controls', () => {
  it('starts on All and provides one-click 1Y, 3Y and reset', () => {
    render(<Example />)
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/January 2022 to December 2025/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '1Y' }))
    expect(screen.getByText(/January 2025 to December 2025/)).toBeInTheDocument()
    expect(screen.getByText(/12 of 48 points/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '3Y' }))
    expect(screen.getByText(/January 2023 to December 2025/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('provides labelled native sliders and bounded paging for keyboard and touch', () => {
    render(<Example />)
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    const start = screen.getByRole('slider', { name: 'Range start' })
    const end = screen.getByRole('slider', { name: 'Range end' })
    expect(start).toHaveAttribute('type', 'range')
    expect(start).toHaveAttribute('aria-valuetext', 'January 2022')
    fireEvent.change(start, { target: { value: '12' } })
    fireEvent.change(end, { target: { value: '17' } })
    expect(screen.getByText(/Custom range/)).toBeInTheDocument()
    expect(screen.getByText(/January 2023 to June 2023/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier dates' }))
    expect(screen.getByText(/July 2022 to December 2022/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier dates' }))
    expect(screen.getByRole('button', { name: 'Show earlier dates' })).toBeDisabled()
    for (let index = 0; index < 10; index++) fireEvent.click(screen.getByRole('button', { name: 'Show later dates' }))
    expect(screen.getByRole('button', { name: 'Show later dates' })).toBeDisabled()
    expect(screen.getByText(/July 2025 to December 2025/)).toBeInTheDocument()
  })

  it('preserves selection on value refresh, resets when dates change', () => {
    const { result, rerender } = renderHook(({ dates }) => useChartRange(dates), { initialProps: { dates: MONTHS } })
    act(() => result.current.setRange({ startIndex: 4, endIndex: 11 }))
    rerender({ dates: [...MONTHS] })
    expect(result.current).toMatchObject({ startIndex: 4, endIndex: 11 })
    rerender({ dates: MONTHS.slice(12) })
    expect(result.current).toMatchObject({ startIndex: 0, endIndex: 35, isAll: true })
  })

  it('uses calendar dates rather than row counts for sparse or leap-year data', () => {
    const { result } = renderHook(() => useChartRange([
      '2020-02-29', '2023-02-28', '2023-03-01', '2023-12-31', '2024-02-29',
    ]))
    expect(result.current.presets.find((preset) => preset.label === '1Y')).toMatchObject({
      startIndex: 2, endIndex: 4,
    })
  })

  it('fits shorter datasets, handles empty/single data and clamps custom values', () => {
    const { result, rerender } = renderHook(({ dates }) => useChartRange(dates), { initialProps: { dates: MONTHS.slice(0, 9) } })
    expect(result.current.presets.map((preset) => preset.label)).toEqual(['All', '3M', '6M'])
    act(() => result.current.setRange({ startIndex: -5, endIndex: 100 }))
    expect(result.current).toMatchObject({ startIndex: 0, endIndex: 8 })
    act(() => result.current.setRange({ startIndex: 7, endIndex: 2 }))
    expect(result.current).toMatchObject({ startIndex: 2, endIndex: 7 })
    rerender({ dates: [] })
    expect(result.current).toMatchObject({ startIndex: 0, endIndex: 0, isAll: true })
    rerender({ dates: ['2026-01'] })
    expect(result.current.presets).toHaveLength(1)
  })

  it('uses honest point-count presets for non-date buckets', () => {
    const { result } = renderHook(() => useChartRange(['1', '2', '3', '4', '5', '6']))
    expect(result.current.presets).toEqual([
      { label: 'All', startIndex: 0, endIndex: 5 },
      { label: 'Last 3', startIndex: 3, endIndex: 5 },
    ])
  })
})

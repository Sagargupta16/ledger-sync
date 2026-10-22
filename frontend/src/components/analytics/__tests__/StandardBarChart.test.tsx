import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { formatCurrencyShort } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

import StandardBarChart from '../StandardBarChart'
import { barFill, barSlots, baselineValue, referenceLineProps, useHiddenSeries } from '../standardBarChartParts'

/**
 * jsdom has no ResizeObserver, so the chart kit paints at its 640px fallback
 * width; reduced motion makes it draw final geometry at once. Most cases assert
 * the accessible layer (role="img" name + sr-only data table), the contract
 * screen readers consume; the rest assert the helpers each rule lives in.
 */
const MONTHS = [
  { displayPeriod: 'Jan', expense: 1000 },
  { displayPeriod: 'Feb', expense: 2000 },
  { displayPeriod: 'Mar', expense: 3000 },
]

const BARS = [{ key: 'expense', color: '#000000', label: 'Expense' }]

beforeEach(() => {
  useMotionStore.getState().setMode('reduced')
})

function bodyRows(): string[][] {
  const body = screen.getByRole('table').querySelector('tbody') as HTMLElement
  return Array.from(body.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((c) => c.textContent ?? ''),
  )
}

describe('StandardBarChart', () => {
  it('exposes an sr-only data table with one row per data point', () => {
    render(
      <StandardBarChart
        data={MONTHS}
        bars={BARS}
        ariaLabel="Monthly expenses"
        tooltipFormatter={(v) => String(v)}
      />,
    )

    const table = screen.getByRole('table')
    expect(table.className).toContain('sr-only')
    expect(bodyRows()).toEqual([
      ['Jan', '1000'],
      ['Feb', '2000'],
      ['Mar', '3000'],
    ])
  })

  it('names the chart and captions the table from ariaLabel', () => {
    render(<StandardBarChart data={MONTHS} bars={BARS} ariaLabel="Monthly expenses" />)

    expect(screen.getByRole('img', { name: 'Monthly expenses' })).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Monthly expenses')).toBeInTheDocument()
  })

  it('emits one table column per bar series, labelled by the bar label', () => {
    render(
      <StandardBarChart
        data={[{ displayPeriod: 'Jan', income: 5000, expense: 3000 }]}
        bars={[
          { key: 'income', color: '#000000', label: 'Income' },
          { key: 'expense', color: '#111111', label: 'Expense' },
        ]}
        ariaLabel="Income vs expense"
        tooltipFormatter={(v) => String(v)}
      />,
    )

    expect(screen.getByRole('columnheader', { name: 'Income' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Expense' })).toBeInTheDocument()
    expect(bodyRows()).toEqual([['Jan', '5000', '3000']])
  })

  it('labels rows from yCategoryKey in the vertical (ranking) layout', () => {
    render(
      <StandardBarChart
        data={[
          { category: 'Rent', amount: 30000 },
          { category: 'Food', amount: 12000 },
        ]}
        bars={[{ key: 'amount', color: '#000000', label: 'Amount' }]}
        layout="vertical"
        yCategoryKey="category"
        ariaLabel="Spending by category"
        tooltipFormatter={(v) => String(v)}
      />,
    )

    expect(bodyRows()).toEqual([
      ['Rent', '30000'],
      ['Food', '12000'],
    ])
  })

  it('renders the empty state instead of a table when there is no data', () => {
    render(<StandardBarChart data={[]} bars={BARS} emptyMessage="Nothing to show" />)

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Nothing to show')).toBeInTheDocument()
  })

  it('heads the row column "Period" for the default time-series layout', () => {
    render(<StandardBarChart data={MONTHS} bars={BARS} ariaLabel="Monthly expenses" />)

    expect(screen.getByRole('columnheader', { name: 'Period' })).toBeInTheDocument()
  })

  it('heads the row column "Category" for the vertical ranking layout', () => {
    // Regression: the header was hardcoded to "Period", so a screen reader on the
    // FIRE variants ranking chart announced "Period: Lean".
    render(
      <StandardBarChart
        data={[{ category: 'Lean', amount: 30000 }]}
        bars={[{ key: 'amount', color: '#000000', label: 'Amount' }]}
        layout="vertical"
        yCategoryKey="category"
        ariaLabel="FIRE variants"
      />,
    )

    expect(screen.getByRole('columnheader', { name: 'Category' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Period' })).not.toBeInTheDocument()
  })

  it('lets a caller name the row column explicitly via rowHeaderLabel', () => {
    render(
      <StandardBarChart
        data={[{ name: 'Mon', avg: 500 }]}
        dataKey="name"
        bars={[{ key: 'avg', color: '#000000', label: 'Avg Spending' }]}
        rowHeaderLabel="Day"
        ariaLabel="Average spending by day of the week"
      />,
    )

    expect(screen.getByRole('columnheader', { name: 'Day' })).toBeInTheDocument()
  })
})

describe('StandardBarChart legend toggles', () => {
  // Expense dwarfs income, so hiding it shrinks the value axis a hundredfold.
  const ROWS = [
    { displayPeriod: 'Jan', income: 1000, expense: 100000 },
    { displayPeriod: 'Feb', income: 800, expense: 90000 },
  ]
  const TWO_BARS = [
    { key: 'income', color: '#000000', label: 'Income' },
    { key: 'expense', color: '#111111', label: 'Expense' },
  ]
  const barsIn = (color: string) =>
    screen.getByRole('img', { name: 'Cash flow' }).querySelectorAll(`path[fill="${color}"]`).length

  it('drops a hidden series from the plot and the axis, but not from the table', () => {
    render(<StandardBarChart data={ROWS} bars={TWO_BARS} ariaLabel="Cash flow" tooltipFormatter={(v) => String(v)} />)
    expect(barsIn('#111111')).toBe(2)
    expect(screen.queryByText(formatCurrencyShort(1000))).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expense' }))

    expect(screen.getByRole('button', { name: 'Expense' })).toHaveAttribute('aria-pressed', 'false')
    expect(barsIn('#111111')).toBe(0)
    expect(barsIn('#000000')).toBe(2)
    // The value axis now spans income alone: 0 to 1,000 in steps of 200.
    expect(screen.getByText(formatCurrencyShort(1000))).toBeInTheDocument()
    expect(bodyRows()).toEqual([
      ['Jan', '1000', '100000'],
      ['Feb', '800', '90000'],
    ])
  })

  it('locks the last visible series on and brings a hidden one back', () => {
    render(<StandardBarChart data={ROWS} bars={TWO_BARS} ariaLabel="Cash flow" />)
    fireEvent.click(screen.getByRole('button', { name: 'Expense' }))

    const income = screen.getByRole('button', { name: 'Income' })
    expect(income).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(income)
    expect(barsIn('#000000')).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Expense' }))
    expect(barsIn('#111111')).toBe(2)
    expect(income).not.toHaveAttribute('aria-disabled')
  })

  it('offers no toggles for a single series', () => {
    render(<StandardBarChart data={MONTHS} bars={BARS} ariaLabel="Monthly expenses" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('useHiddenSeries', () => {
  it('flips a key on each toggle and hides nothing while the legend does not toggle', () => {
    const { result, rerender } = renderHook(({ toggles }) => useHiddenSeries(['a', 'b'], toggles), {
      initialProps: { toggles: true },
    })
    act(() => result.current[1]('a'))
    expect([...result.current[0]]).toEqual(['a'])
    act(() => result.current[1]('a'))
    expect(result.current[0].size).toBe(0)

    act(() => result.current[1]('b'))
    rerender({ toggles: false })
    expect(result.current[0].size).toBe(0)
  })

  it('keeps a hidden key through new data, and drops it once it leaves the series list', () => {
    const { result, rerender } = renderHook(({ keys }) => useHiddenSeries(keys, true), {
      initialProps: { keys: ['a', 'b', 'c'] },
    })
    act(() => result.current[1]('a'))
    rerender({ keys: ['a', 'b', 'c'] })
    expect(result.current[0].has('a')).toBe(true)

    rerender({ keys: ['b', 'c'] })
    rerender({ keys: ['a', 'b', 'c'] })
    expect(result.current[0].has('a')).toBe(false)
  })

  it('shows every series again when none of the listed ones would be left', () => {
    const { result, rerender } = renderHook(({ keys }) => useHiddenSeries(keys, true), {
      initialProps: { keys: ['a', 'b', 'c'] },
    })
    act(() => result.current[1]('a'))
    act(() => result.current[1]('b'))
    rerender({ keys: ['a', 'b'] })

    expect(result.current[0].size).toBe(0)
  })
})

describe('StandardBarChart baseline', () => {
  const SPIKY = [{ v: 10 }, { v: 20 }, { v: 90 }]
  const ONE_BAR = [{ key: 'v', color: '#000000' }]

  it('draws the line at the median of the first series, not the mean', () => {
    // mean would be 40; median resists the 90 spike.
    expect(baselineValue(true, SPIKY, ONE_BAR, 'horizontal')?.value).toBe(20)
  })

  it('labels the line with the statistic value', () => {
    const label = baselineValue(true, SPIKY, ONE_BAR, 'horizontal')?.label

    expect(label).toContain('Typical')
    expect(label).toContain('20')
  })

  it('honours an explicit label and the mean statistic', () => {
    const mark = baselineValue({ label: 'Typical month', statistic: 'mean' }, SPIKY, ONE_BAR, 'horizontal')

    expect(mark?.value).toBe(40)
    expect(mark?.label).toContain('Typical month')
  })

  it('scopes the statistic to a trailing window when one is given', () => {
    // Last two points are 20 and 90 -> median 55.
    expect(baselineValue({ window: 2 }, SPIKY, ONE_BAR, 'horizontal')?.value).toBe(55)
  })

  it('renders nothing when not opted in', () => {
    expect(baselineValue(undefined, SPIKY, ONE_BAR, 'horizontal')).toBeNull()
    expect(baselineValue(false, SPIKY, ONE_BAR, 'horizontal')).toBeNull()
  })

  it('renders nothing for the vertical ranking layout, where a value line is meaningless', () => {
    expect(baselineValue(true, SPIKY, ONE_BAR, 'vertical')).toBeNull()
  })

  it('renders nothing when there is no data to summarize', () => {
    expect(baselineValue(true, [], ONE_BAR, 'horizontal')).toBeNull()
  })

  it('draws the labelled line on the chart', () => {
    render(<StandardBarChart data={MONTHS} bars={BARS} baseline ariaLabel="Monthly expenses" />)

    expect(screen.getByText(`Typical: ${formatCurrencyShort(2000)}`)).toBeInTheDocument()
  })
})

describe('StandardBarChart bar paint and grouping', () => {
  const BASE = { key: 'v', color: '#000000' }

  it('resolves the colour from getCellColor using the row, not the drawn position', () => {
    const bar = {
      ...BASE,
      getCellColor: (row: Record<string, unknown>) => (row.over ? '#ff0000' : '#00ff00'),
    }

    expect(barFill(bar, { over: true }, 3)).toBe('#ff0000')
  })

  it('indexes cellColors by the row index in the full data, so a skipped bar cannot shift the ramp', () => {
    const bar = { ...BASE, cellColors: ['#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd'] }

    expect(barFill(bar, {}, 3)).toBe('#dddddd')
  })

  it('falls back to the series colour when no per-item colour resolves', () => {
    expect(barFill({ ...BASE, cellColors: ['#aaaaaa'] }, {}, 5)).toBe('#000000')
    expect(barFill(BASE, {}, 0)).toBe('#000000')
  })

  it('paints each drawn bar in its cell colour and configured opacity, skipping zero rows', () => {
    const tiers = [
      { tier: 'Lean', corpus: 10, color: '#00ff00' },
      { tier: 'Empty', corpus: 0, color: '#ffff00' },
      { tier: 'Fat', corpus: 30, color: '#ff00ff' },
    ]
    const cellColor = (row: Record<string, unknown>) => (row as { color: string }).color
    const bars = [{ key: 'corpus', color: '#0000ff', fillOpacity: 0.7, getCellColor: cellColor }]
    render(<StandardBarChart data={tiers} bars={bars} layout="vertical" yCategoryKey="tier" dataKey="tier" ariaLabel="FIRE variants" />)

    const paths = screen.getByRole('img', { name: 'FIRE variants' }).querySelectorAll('path[fill]')
    expect(Array.from(paths, (path) => [path.getAttribute('fill'), path.getAttribute('fill-opacity')])).toEqual([
      ['#00ff00', '0.7'],
      ['#ff00ff', '0.7'],
    ])
  })

  it('gives each unstacked series its own slot and each stack, or a stacked chart, one shared slot', () => {
    const [a, b, c] = barSlots([
      { key: 'a', color: '#000000', stackId: 's' },
      { key: 'b', color: '#111111' },
      { key: 'c', color: '#222222', stackId: 's' },
    ])

    expect([a, b, c].map((slot) => [slot.groupIndex, slot.groupCount])).toEqual([[0, 2], [1, 2], [0, 2]])
    expect(c).toMatchObject({ stackId: 's', stackKeys: ['a', 'c'] })
    expect(b.stackKeys).toBeUndefined()
    expect(barSlots([BASE, { key: 'w', color: '#111111' }], true)[1])
      .toEqual({ groupIndex: 0, groupCount: 1, stackId: 'stack', stackKeys: ['v', 'w'] })
  })

  it('reads reference y as the value in columns and x in rankings, keeping a dashed default stroke', () => {
    expect(referenceLineProps({ y: 500, label: 'Cap', variant: 'target' }, 'horizontal'))
      .toEqual({ value: 500, label: 'Cap', variant: 'target' })
    expect(referenceLineProps({ x: 500, y: 'Rent' }, 'vertical')).toMatchObject({ value: 500, category: 'Rent' })
    expect(referenceLineProps({ y: 0, color: '#123456' }, 'horizontal'))
      .toMatchObject({ value: 0, color: '#123456', dash: '3 3' })
  })
})

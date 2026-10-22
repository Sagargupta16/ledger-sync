import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SEMANTIC_COLORS, getChartColor } from '@/constants/chartColors'
import { refreshRawColors } from '@/constants/colors'
import { useMotionStore } from '@/store/motionStore'

import StandardPieChart from '../StandardPieChart'
import { buildPieSlices, holeRatio, toPieData } from '../standardPieChartParts'

/**
 * The first block asserts on the accessible layer -- the role="img" name and
 * the sr-only data table -- which is the contract a screen reader consumes and
 * which mirrors the wedges one-for-one. The kit paints its SVG at a 640px
 * fallback width under jsdom, so the slices themselves are asserted further down.
 */
function makeData(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Cat ${i + 1}`,
    value: (count - i) * 1000,
  }))
}

function tableRowLabels(): string[] {
  const table = screen.getByRole('table')
  const body = table.querySelector('tbody') as HTMLElement
  return Array.from(body.querySelectorAll('tr')).map(
    (tr) => tr.querySelector('th')?.textContent ?? '',
  )
}

describe('StandardPieChart', () => {
  it('renders 7 rows with an Other rollup for a 12-category input', () => {
    render(<StandardPieChart data={makeData(12)} ariaLabel="Expenses by category" />)

    const labels = tableRowLabels()
    expect(labels).toHaveLength(7)
    expect(labels.at(-1)).toBe('Other (6 categories)')
  })

  it('exposes shares that sum to 100 percent, so Other keeps the total honest', () => {
    render(<StandardPieChart data={makeData(12)} ariaLabel="Expenses by category" />)

    const body = screen.getByRole('table').querySelector('tbody') as HTMLElement
    const shares = Array.from(body.querySelectorAll('tr')).map((tr) => {
      const cells = tr.querySelectorAll('td')
      return Number.parseFloat(cells[1].textContent?.replace('%', '') ?? '0')
    })
    expect(shares).toHaveLength(7)
    expect(shares.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 1)
  })

  it('leaves a 5-category input uncapped', () => {
    render(<StandardPieChart data={makeData(5)} ariaLabel="Income by source" />)

    expect(tableRowLabels()).toEqual(['Cat 1', 'Cat 2', 'Cat 3', 'Cat 4', 'Cat 5'])
  })

  it('respects an explicit opt-out cap', () => {
    render(<StandardPieChart data={makeData(12)} maxSlices={0} ariaLabel="All categories" />)

    expect(tableRowLabels()).toHaveLength(12)
  })

  it('names the chart through its ariaLabel and captions the data table', () => {
    render(<StandardPieChart data={makeData(3)} ariaLabel="Expenses by category" />)

    expect(screen.getByRole('img', { name: 'Expenses by category' })).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Expenses by category')).toBeInTheDocument()
    expect(table.className).toContain('sr-only')
  })

  it('renders the empty state instead of a table when nothing is positive', () => {
    render(
      <StandardPieChart
        data={[{ name: 'Refund', value: -5 }, { name: 'Zero', value: 0 }]}
        emptyMessage="No spending yet"
      />,
    )

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('No spending yet')).toBeInTheDocument()
  })

  it('captions the table descriptively when no ariaLabel is given', () => {
    // Regression: the caption used to fall back to `centerLabel`, so a screen
    // reader met a table captioned "Total" (or the literal string "Chart data").
    render(<StandardPieChart data={makeData(3)} centerLabel="Total" centerValue="₹6,000" />)

    const caption = screen.getByRole('table').querySelector('caption')
    expect(caption?.textContent).toBe('Chart data: 3 categories by amount')
  })

  it('singularises the fallback caption for a one-slice chart', () => {
    render(<StandardPieChart data={makeData(1)} centerLabel="Total" />)

    expect(screen.getByRole('table').querySelector('caption')?.textContent).toBe(
      'Chart data: 1 category by amount',
    )
  })

  it('routes the sr-only amounts through a custom tooltipFormatter', () => {
    render(
      <StandardPieChart
        data={[{ name: 'Solo', value: 42 }]}
        tooltipFormatter={(v) => `${v} units`}
        ariaLabel="Units by bucket"
      />,
    )

    expect(within(screen.getByRole('table')).getByText('42 units')).toBeInTheDocument()
  })
})

describe('StandardPieChart slice colours', () => {
  it('refreshes a cached slice palette when the theme tokens change', () => {
    const rows = buildPieSlices([{ name: 'A', value: 3 }], 7)
    const previous = document.documentElement.style.getPropertyValue('--color-app-purple')

    try {
      document.documentElement.style.setProperty('--color-app-purple', '#010203')
      refreshRawColors()

      expect(rows[0].fill).toBe('#010203')
      // The kit data is rebuilt each render, so the wedge takes the new colour too.
      expect(toPieData(rows)[0].color).toBe('#010203')
    } finally {
      if (previous) document.documentElement.style.setProperty('--color-app-purple', previous)
      else document.documentElement.style.removeProperty('--color-app-purple')
      refreshRawColors()
    }
  })

  it('pins the palette colour onto each row, so colour and slice travel together', () => {
    // Positional colouring slid the palette onto the wrong category as soon as
    // anything dropped or reordered a slice.
    const rows = buildPieSlices([{ name: 'A', value: 3 }, { name: 'B', value: 1 }], 7)

    expect(rows.map((r) => r.name)).toEqual(['A', 'B'])
    expect(rows.map((r) => r.fill)).toEqual([getChartColor(0), getChartColor(1)])
  })

  it('keeps an explicit per-slice colour over the palette', () => {
    const rows = buildPieSlices([{ name: 'Income', value: 1, color: '#123456' }], 7)

    expect(rows[0].fill).toBe('#123456')
  })

  it('carries the muted colour of the synthetic Other rollup', () => {
    const rows = buildPieSlices(
      Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, value: 9 - i })),
      7,
    )

    expect(rows).toHaveLength(7)
    expect(rows.at(-1)?.name).toBe('Other (3 categories)')
    expect(rows.at(-1)?.fill).toBe(SEMANTIC_COLORS.muted)
  })
})

describe('StandardPieChart kit data', () => {
  it('keys each slice by its category name and lets real categories open', () => {
    const [slice] = toPieData(buildPieSlices([{ name: 'Rent', value: 30 }], 7))

    expect(slice).toMatchObject({ key: 'Rent', label: 'Rent', value: 30, selectable: true })
  })

  it('never lets the Other rollup open, since it deep-links nowhere', () => {
    const rows = buildPieSlices(Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, value: 9 - i })), 7)

    expect(toPieData(rows).map((slice) => slice.selectable)).toEqual([true, true, true, true, true, true, false])
  })

  it('turns the percentage radii into the hole-to-rim ratio', () => {
    expect(holeRatio('60%', '85%')).toBeCloseTo(0.706, 3)
    expect(holeRatio('0%', '85%')).toBe(0)
  })
})

describe('StandardPieChart slices', () => {
  // Reduced motion draws the final geometry at once, with no animation frame to wait on.
  beforeEach(() => useMotionStore.getState().setMode('reduced'))
  afterEach(() => {
    // Unmount first, so restoring the store re-renders nothing outside act().
    cleanup()
    useMotionStore.getState().setMode('full')
  })

  const DATA = [
    { name: 'Food', value: 12_000 },
    { name: 'Rent', value: 30_000 },
    { name: 'Travel', value: 8_000 },
  ]

  function sliceOpacities(container: HTMLElement): Record<string, number> {
    return Object.fromEntries(
      Array.from(container.querySelectorAll('path[data-slice]'), (path) => [
        path.getAttribute('data-slice') ?? '',
        Number(path.getAttribute('opacity')),
      ]),
    )
  }

  it('lifts the slice under a hovered ledger row and swaps the centre to its share', () => {
    const { container } = render(
      <StandardPieChart data={DATA} centerValue="₹50,000" centerLabel="Total" ariaLabel="Spending by category" />,
    )
    const rent = within(screen.getByRole('list', { name: 'Chart categories' })).getAllByRole('listitem')[0]

    fireEvent.mouseEnter(rent)
    const hovered = sliceOpacities(container)
    expect(hovered.Rent).toBe(1)
    expect(hovered.Food).toBeLessThan(1)
    expect(hovered.Travel).toBeLessThan(1)
    expect(screen.getByText('60.0% of total')).toBeInTheDocument()

    fireEvent.mouseLeave(rent)
    expect(Object.values(sliceOpacities(container))).toEqual([1, 1, 1])
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('offers a pointer only on slices a click can open', () => {
    const { container, rerender } = render(
      <StandardPieChart data={makeData(12)} onSliceClick={vi.fn()} ariaLabel="Expenses by category" />,
    )
    const pointers = () =>
      Array.from(container.querySelectorAll('path[data-slice]'), (path) => path.classList.contains('cursor-pointer'))

    expect(pointers()).toEqual([true, true, true, true, true, true, false])

    rerender(<StandardPieChart data={makeData(12)} ariaLabel="Expenses by category" />)
    expect(pointers()).toEqual(Array.from({ length: 7 }, () => false))
  })

  it('opens a real slice from the keyboard but never the Other rollup', () => {
    const onSliceClick = vi.fn()
    render(<StandardPieChart data={makeData(12)} onSliceClick={onSliceClick} ariaLabel="Expenses by category" />)
    const chart = screen.getByRole('img', { name: 'Expenses by category' })

    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    fireEvent.keyDown(chart, { key: 'Enter' })
    expect(onSliceClick).toHaveBeenCalledExactlyOnceWith('Cat 1')

    // Back one from the first slice wraps to the last: the Other rollup.
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    fireEvent.keyDown(chart, { key: 'Enter' })
    expect(onSliceClick).toHaveBeenCalledOnce()
  })
})

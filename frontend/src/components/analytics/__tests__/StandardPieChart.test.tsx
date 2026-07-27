import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SEMANTIC_COLORS, getChartColor } from '@/constants/chartColors'

import StandardPieChart from '../StandardPieChart'
import { buildPieSlices, renderPieSectorShape } from '../standardPieChartParts'

/**
 * Recharts needs a measured container; jsdom reports 0x0, so the SVG paths never
 * render. These tests therefore assert on the accessible layer -- the role="img"
 * name and the sr-only data table -- which is exactly the contract a screen
 * reader consumes, and which mirrors the wedges one-for-one.
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

  it('names the chart via ChartContainer ariaLabel and captions the data table', () => {
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

    expect(screen.getByText('42 units')).toBeInTheDocument()
  })
})

/**
 * Wedge colour and hover paint moved off `<Cell>` children (deprecated, removed
 * in Recharts 4.0) onto datum-carried `fill` plus a `shape` render prop. jsdom
 * never paints the SVG, so both are asserted on the pure functions directly.
 */
describe('StandardPieChart slice colours', () => {
  it('pins the palette colour onto each row, so colour and slice travel together', () => {
    // `<Cell>` children were matched by RENDERED position, so anything that
    // dropped or reordered a sector slid the palette onto the wrong category.
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

describe('StandardPieChart sector shape', () => {
  /** The props Recharts hands a sector shape, trimmed to what the renderer reads. */
  function sectorProps(row: Record<string, unknown>) {
    return { payload: row, index: 0 } as never
  }

  function styleOf(
    activeName: string | null,
    hasClickHandler: boolean,
    row: Record<string, unknown>,
  ) {
    const Shape = renderPieSectorShape(activeName, hasClickHandler)
    const el = Shape(sectorProps(row)) as { props: { style: Record<string, unknown> } }
    return el.props.style
  }

  it('brightens the hovered wedge and fades the others', () => {
    const hovered = styleOf('Rent', false, { name: 'Rent', value: 1 })
    const other = styleOf('Rent', false, { name: 'Food', value: 1 })

    expect(hovered.filter).toBe('brightness(1.18)')
    expect(hovered.opacity).toBe(1)
    expect(other.opacity).toBe(0.4)
  })

  it('matches the hovered wedge by name, not by rendered position', () => {
    // Recharts drops zero-value sectors, so a positional match could highlight
    // a neighbour once any slice fell out of the rendered list.
    expect(styleOf('Food', false, { name: 'Food', value: 1 }).opacity).toBe(1)
  })

  it('leaves every wedge at full opacity when nothing is hovered', () => {
    expect(styleOf(null, false, { name: 'Rent', value: 1 }).opacity).toBe(1)
  })

  it('offers a pointer only where a click has somewhere to go', () => {
    expect(styleOf(null, true, { name: 'Rent', value: 1 }).cursor).toBe('pointer')
    expect(styleOf(null, false, { name: 'Rent', value: 1 }).cursor).toBe('default')
  })

  it('never offers a pointer on the Other rollup, which deep-links nowhere', () => {
    const style = styleOf(null, true, { name: 'Other (3 categories)', value: 1, isOther: true })

    expect(style.cursor).toBe('default')
  })
})

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import StandardBarChart from '../StandardBarChart'
import { renderBaseline, renderBarShape } from '../standardBarChartParts'

/**
 * jsdom reports a 0x0 container, so Recharts never paints the SVG. These tests
 * assert on the accessible layer (role="img" name + sr-only data table), which
 * is the contract screen readers consume and mirrors the bars one-for-one.
 */
const MONTHS = [
  { displayPeriod: 'Jan', expense: 1000 },
  { displayPeriod: 'Feb', expense: 2000 },
  { displayPeriod: 'Mar', expense: 3000 },
]

const BARS = [{ key: 'expense', color: '#000000', label: 'Expense' }]

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

/**
 * The baseline is a Recharts `<ReferenceLine>`. jsdom never paints it, and
 * Recharts strips unknown children from the DOM, so rendering the chart cannot
 * prove the line exists -- an earlier version of this suite "tested" the feature
 * by asserting the data table was unchanged, which passed identically with the
 * baseline deleted. These assert the returned element directly instead.
 */
describe('StandardBarChart baseline', () => {
  const SPIKY = [{ v: 10 }, { v: 20 }, { v: 90 }]
  const ONE_BAR = [{ key: 'v', color: '#000000' }]

  function baselineProps(el: ReturnType<typeof renderBaseline>) {
    return (el as { props: { y: number; label: { value: string } } }).props
  }

  it('draws the line at the median of the first series, not the mean', () => {
    const el = renderBaseline(true, SPIKY, ONE_BAR, 'horizontal')

    // mean would be 40; median resists the 90 spike.
    expect(baselineProps(el).y).toBe(20)
  })

  it('labels the line with the statistic value', () => {
    const el = renderBaseline(true, SPIKY, ONE_BAR, 'horizontal')

    expect(baselineProps(el).label.value).toContain('Typical')
    expect(baselineProps(el).label.value).toContain('20')
  })

  it('honours an explicit label and the mean statistic', () => {
    const el = renderBaseline(
      { label: 'Typical month', statistic: 'mean' },
      SPIKY,
      ONE_BAR,
      'horizontal',
    )

    expect(baselineProps(el).y).toBe(40)
    expect(baselineProps(el).label.value).toContain('Typical month')
  })

  it('scopes the statistic to a trailing window when one is given', () => {
    const el = renderBaseline({ window: 2 }, SPIKY, ONE_BAR, 'horizontal')

    // Last two points are 20 and 90 -> median 55.
    expect(baselineProps(el).y).toBe(55)
  })

  it('renders nothing when not opted in', () => {
    expect(renderBaseline(undefined, SPIKY, ONE_BAR, 'horizontal')).toBeNull()
    expect(renderBaseline(false, SPIKY, ONE_BAR, 'horizontal')).toBeNull()
  })

  it('renders nothing for the vertical ranking layout, where a y-line is meaningless', () => {
    expect(renderBaseline(true, SPIKY, ONE_BAR, 'vertical')).toBeNull()
  })

  it('renders nothing when there is no data to summarize', () => {
    expect(renderBaseline(true, [], ONE_BAR, 'horizontal')).toBeNull()
  })
})

/**
 * Per-bar colour moved from deprecated `<Cell>` children to Recharts' `shape`
 * render prop (Cell is removed in Recharts 4.0). The renderer is a pure function
 * of the props Recharts hands it, so it is asserted directly -- jsdom never
 * paints the SVG, so rendering the chart could not prove any of this.
 */
describe('StandardBarChart per-bar shape', () => {
  const BASE = { key: 'v', color: '#000000' }

  /** The props Recharts passes a bar shape, trimmed to what the renderer reads. */
  function shapeProps(index: number, row: Record<string, unknown>, originalDataIndex = index) {
    return {
      x: 0, y: 0, width: 10, height: 20,
      index, originalDataIndex, payload: row, value: 1,
    } as never
  }

  function fillOf(
    bar: Parameters<typeof renderBarShape>[0],
    activeIndex: number | null,
    isolate: boolean,
    props: ReturnType<typeof shapeProps>,
  ) {
    const Shape = renderBarShape(bar, activeIndex, isolate)
    if (!Shape) throw new Error('expected a shape renderer')
    const el = Shape(props) as { props: { fill?: string; fillOpacity?: number } }
    return el.props
  }

  it('is omitted entirely when neither per-item colour nor isolation is asked for', () => {
    // Returning undefined lets `<Bar shape={...}>` fall back to Recharts'
    // default rectangle rather than paying for a custom renderer per bar.
    expect(renderBarShape(BASE, null, false)).toBeUndefined()
  })

  it('resolves the colour from getCellColor using the row, not the render position', () => {
    const bar = {
      ...BASE,
      getCellColor: (row: Record<string, unknown>) => (row.over ? '#ff0000' : '#00ff00'),
    }

    // Rendered at slot 0 but is really row 3 -- the regression `<Cell>` could not
    // express, because Cell children are matched by rendered position.
    expect(fillOf(bar, null, false, shapeProps(0, { over: true }, 3)).fill).toBe('#ff0000')
  })

  it('indexes cellColors by the pre-filter row index, so a dropped bar cannot shift the ramp', () => {
    const bar = { ...BASE, cellColors: ['#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd'] }

    // Recharts filters zero-dimension bars out of the rendered list, so slot 1
    // can be row 3. Positional Cell children would have painted '#bbbbbb' here.
    expect(fillOf(bar, null, false, shapeProps(1, {}, 3)).fill).toBe('#dddddd')
  })

  it('falls back to the series colour when no per-item colour resolves', () => {
    const bar = { ...BASE, cellColors: ['#aaaaaa'] }

    expect(fillOf(bar, null, false, shapeProps(5, {}, 5)).fill).toBe('#000000')
  })

  it('dims every bar except the hovered one when isolating', () => {
    expect(fillOf(BASE, 2, true, shapeProps(0, {}, 0)).fillOpacity).toBe(0.35)
    expect(fillOf(BASE, 2, true, shapeProps(2, {}, 2)).fillOpacity).toBe(1)
  })

  it('leaves every bar at full opacity when nothing is hovered', () => {
    expect(fillOf(BASE, null, true, shapeProps(0, {}, 0)).fillOpacity).toBe(1)
  })

  it('keeps the configured fillOpacity for the bar it does not dim', () => {
    const bar = { ...BASE, fillOpacity: 0.8 }

    expect(fillOf(bar, 1, true, shapeProps(1, {}, 1)).fillOpacity).toBe(0.8)
  })

  it('never dims when isolation is off, even with an active index', () => {
    const bar = { ...BASE, cellColors: ['#aaaaaa', '#bbbbbb'] }

    expect(fillOf(bar, 0, false, shapeProps(1, {}, 1)).fillOpacity).toBe(1)
  })
})

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import StandardPieChart from '../StandardPieChart'

const DATA = [
  { name: 'Food', value: 12_000 },
  { name: 'Rent', value: 30_000 },
  { name: 'Travel', value: 8_000 },
]

describe('StandardPieChart allocation legend', () => {
  it('ranks categories with exact amounts and shares without changing the input', () => {
    render(<StandardPieChart data={DATA} ariaLabel="Spending by category" />)

    const rows = within(screen.getByRole('list', { name: 'Chart categories' })).getAllByRole('listitem')
    expect(within(rows[0]).getByText('Rent')).toBeInTheDocument()
    expect(within(rows[0]).getByText('₹30,000')).toBeInTheDocument()
    expect(within(rows[0]).getByText('60.0%')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Food')).toBeInTheDocument()
    expect(within(rows[1]).getByText('24.0%')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Travel')).toBeInTheDocument()
    expect(DATA.map((slice) => slice.name)).toEqual(['Food', 'Rent', 'Travel'])
  })

  it('routes amounts through the caller formatter while computing shares from the raw values', () => {
    render(<StandardPieChart data={DATA} tooltipFormatter={(value) => `${value} units`} />)

    const legend = screen.getByRole('list', { name: 'Chart categories' })
    expect(within(legend).getByText('30000 units')).toBeInTheDocument()
    expect(within(legend).getByText('60.0%')).toBeInTheDocument()
  })

  it('exposes real categories as native buttons when a drill-down is available', () => {
    const onSliceClick = vi.fn()
    render(<StandardPieChart data={DATA} onSliceClick={onSliceClick} />)

    const button = screen.getByRole('button', { name: /Rent/ })
    fireEvent.click(button)

    expect(button).toHaveAttribute('type', 'button')
    expect(onSliceClick).toHaveBeenCalledExactlyOnceWith('Rent')
  })

  it('keeps the Other total last and inert even when its aggregate is larger than a named slice', () => {
    const onSliceClick = vi.fn()
    const data = Array.from({ length: 12 }, (_, index) => ({
      name: `Category ${index + 1}`,
      value: (12 - index) * 1000,
    }))
    render(<StandardPieChart data={data} onSliceClick={onSliceClick} />)

    const legend = screen.getByRole('list', { name: 'Chart categories' })
    const rows = within(legend).getAllByRole('listitem')
    const other = rows.at(-1) as HTMLElement
    expect(within(other).getByText('Other (6 categories)')).toBeInTheDocument()
    expect(within(other).getByText('₹21,000')).toBeInTheDocument()
    expect(within(other).getByText('26.9%')).toBeInTheDocument()
    expect(within(other).queryByRole('button')).not.toBeInTheDocument()
    fireEvent.click(other)
    expect(onSliceClick).not.toHaveBeenCalled()
  })

  it('keeps the readable legend and data table outside the image role', () => {
    render(<StandardPieChart data={DATA} ariaLabel="Spending by category" />)

    const chart = screen.getByRole('img', { name: 'Spending by category' })
    expect(chart).not.toContainElement(screen.getByRole('list', { name: 'Chart categories' }))
    expect(chart).not.toContainElement(screen.getByRole('table'))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('omits the legend when the caller supplies a separate one', () => {
    render(<StandardPieChart data={DATA} showLegend={false} ariaLabel="Spending by category" />)

    expect(screen.queryByRole('list', { name: 'Chart categories' })).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})

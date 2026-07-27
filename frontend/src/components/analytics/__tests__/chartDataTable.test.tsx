import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { chartDataTable } from '@/components/ui/chartDataTable'

interface Row {
  readonly label: string
  readonly amount: number
}

const ROWS: Row[] = [
  { label: 'Rent', amount: 30000 },
  { label: 'Food', amount: 12000 },
]

const COLUMNS = [
  { header: 'Category', rowHeader: true, value: (r: Row) => r.label },
  { header: 'Amount', value: (r: Row) => String(r.amount) },
]

describe('chartDataTable', () => {
  it('renders a visually-hidden captioned table', () => {
    render(chartDataTable(ROWS, COLUMNS, 'Spending by category', (r) => r.label))

    const table = screen.getByRole('table')
    expect(table.className).toBe('sr-only')
    expect(table.querySelector('caption')?.textContent).toBe('Spending by category')
  })

  it('marks the rowHeader column as a scoped row header, others as cells', () => {
    render(chartDataTable(ROWS, COLUMNS, 'Spending by category', (r) => r.label))

    const rowHeader = screen.getByRole('rowheader', { name: 'Rent' })
    expect(rowHeader.tagName).toBe('TH')
    expect(rowHeader.getAttribute('scope')).toBe('row')

    const colHeader = screen.getByRole('columnheader', { name: 'Amount' })
    expect(colHeader.getAttribute('scope')).toBe('col')
  })

  it('renders one row per datum with cells in column order', () => {
    render(chartDataTable(ROWS, COLUMNS, 'Spending by category', (r) => r.label))

    const body = screen.getByRole('table').querySelector('tbody') as HTMLElement
    const cells = Array.from(body.querySelectorAll('tr')).map((tr) =>
      Array.from(tr.querySelectorAll('th, td')).map((c) => c.textContent),
    )
    expect(cells).toEqual([
      ['Rent', '30000'],
      ['Food', '12000'],
    ])
  })

  it('renders a header-only table for empty rows', () => {
    render(chartDataTable([] as Row[], COLUMNS, 'Nothing', (r) => r.label))

    const body = screen.getByRole('table').querySelector('tbody') as HTMLElement
    expect(body.querySelectorAll('tr')).toHaveLength(0)
    expect(screen.getByRole('columnheader', { name: 'Category' })).toBeInTheDocument()
  })
})

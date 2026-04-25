import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import DataTable, { type DataTableColumn } from '../DataTable'

interface Row {
  readonly id: string
  readonly name: string
  readonly amount: number
}

const ROWS: Row[] = [
  { id: 'a', name: 'Alpha', amount: 300 },
  { id: 'b', name: 'Bravo', amount: 100 },
  { id: 'c', name: 'Charlie', amount: 200 },
]

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name', cell: (r) => r.name },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    sortable: true,
    cell: (r) => String(r.amount),
  },
]

function getRowNames(): string[] {
  const body = screen.getByRole('table').querySelector('tbody') as HTMLElement
  return Array.from(body.querySelectorAll('tr')).map(
    (tr) => tr.querySelector('td')?.textContent ?? '',
  )
}

describe('DataTable', () => {
  it('renders headers and rows in input order by default', () => {
    render(
      <DataTable<Row>
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        animateRows={false}
      />,
    )
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    expect(getRowNames()).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('renders empty state when rows is empty and emptyState is provided', () => {
    render(
      <DataTable<Row>
        columns={COLUMNS}
        rows={[]}
        rowKey={(r) => r.id}
        emptyState={<div>No data yet</div>}
      />,
    )
    expect(screen.getByText('No data yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders table with zero rows when rows is empty and no emptyState provided', () => {
    render(
      <DataTable<Row>
        columns={COLUMNS}
        rows={[]}
        rowKey={(r) => r.id}
      />,
    )
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('non-sortable columns have no click handler or aria-sort', () => {
    render(
      <DataTable<Row>
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        animateRows={false}
      />,
    )
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' })
    expect(nameHeader).not.toHaveAttribute('aria-sort')
    expect(nameHeader.className).not.toMatch(/cursor-pointer/)
  })

  it('sortable column sorts desc on first click, asc on second, toggles thereafter', () => {
    render(
      <DataTable<Row>
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        animateRows={false}
      />,
    )
    const amountHeader = screen.getByRole('columnheader', { name: /Amount/i })
    expect(amountHeader).toHaveAttribute('aria-sort', 'none')

    fireEvent.click(amountHeader)
    expect(amountHeader).toHaveAttribute('aria-sort', 'descending')
    expect(getRowNames()).toEqual(['Alpha', 'Charlie', 'Bravo']) // 300, 200, 100

    fireEvent.click(amountHeader)
    expect(amountHeader).toHaveAttribute('aria-sort', 'ascending')
    expect(getRowNames()).toEqual(['Bravo', 'Charlie', 'Alpha']) // 100, 200, 300

    fireEvent.click(amountHeader)
    expect(amountHeader).toHaveAttribute('aria-sort', 'descending')
  })

  it('supports keyboard activation (Enter / Space) on sortable headers', () => {
    render(
      <DataTable<Row>
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        animateRows={false}
      />,
    )
    const amountHeader = screen.getByRole('columnheader', { name: /Amount/i })

    fireEvent.keyDown(amountHeader, { key: 'Enter' })
    expect(amountHeader).toHaveAttribute('aria-sort', 'descending')

    fireEvent.keyDown(amountHeader, { key: ' ' })
    expect(amountHeader).toHaveAttribute('aria-sort', 'ascending')
  })

  it('applies initialSort on mount', () => {
    render(
      <DataTable<Row>
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        initialSort={{ key: 'amount', dir: 'asc' }}
        animateRows={false}
      />,
    )
    expect(getRowNames()).toEqual(['Bravo', 'Charlie', 'Alpha'])
  })

  it('uses custom sortValue when provided', () => {
    const columns: DataTableColumn<Row>[] = [
      { key: 'name', header: 'Name', cell: (r) => r.name },
      {
        key: 'absAmount',
        header: 'Abs',
        sortable: true,
        sortValue: (r) => -r.amount, // invert for test
        cell: (r) => String(r.amount),
      },
    ]
    render(
      <DataTable<Row>
        columns={columns}
        rows={ROWS}
        rowKey={(r) => r.id}
        initialSort={{ key: 'absAmount', dir: 'desc' }}
        animateRows={false}
      />,
    )
    // desc by -amount == asc by amount
    expect(getRowNames()).toEqual(['Bravo', 'Charlie', 'Alpha'])
  })

  it('applies rowClassName per row', () => {
    render(
      <DataTable<Row>
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        rowClassName={(r) => (r.amount > 150 ? 'high-value' : 'low-value')}
        animateRows={false}
      />,
    )
    const body = screen.getByRole('table').querySelector('tbody') as HTMLElement
    const rows = within(body).getAllByRole('row')
    expect(rows[0].className).toMatch(/high-value/)
    expect(rows[1].className).toMatch(/low-value/)
    expect(rows[2].className).toMatch(/high-value/)
  })

  it('renders custom cell content', () => {
    const columns: DataTableColumn<Row>[] = [
      {
        key: 'name',
        header: 'Name',
        cell: (r) => <strong data-testid={`name-${r.id}`}>{r.name.toUpperCase()}</strong>,
      },
    ]
    render(
      <DataTable<Row>
        columns={columns}
        rows={ROWS}
        rowKey={(r) => r.id}
        animateRows={false}
      />,
    )
    expect(screen.getByTestId('name-a')).toHaveTextContent('ALPHA')
  })
})

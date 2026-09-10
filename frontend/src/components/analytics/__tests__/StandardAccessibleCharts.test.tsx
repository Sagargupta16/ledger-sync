import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ChartTooltipContent from '@/components/ui/ChartTooltipContent'

import StandardAreaChart from '../StandardAreaChart'
import StandardRadarChart from '../StandardRadarChart'
import TimeSeriesLineChart from '../TimeSeriesLineChart'

function tableRows(): string[][] {
  return Array.from(screen.getByRole('table').querySelectorAll('tbody tr')).map((row) =>
    Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent ?? ''),
  )
}

describe('accessible chart data', () => {
  it('mirrors every area series in a labelled table', () => {
    render(
      <StandardAreaChart
        data={[
          { month: 'Jan', income: 5000, expense: 3000 },
          { month: 'Feb', income: 6000, expense: 3500 },
        ]}
        dataKey="month"
        areas={[
          { key: 'income', color: '#000000', label: 'Income' },
          { key: 'expense', color: '#111111', label: 'Expense' },
        ]}
        ariaLabel="Monthly cash flow"
        tooltipFormatter={(value) => `${value} INR`}
      />,
    )

    expect(screen.getByRole('img', { name: 'Monthly cash flow' })).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Monthly cash flow')).toBeInTheDocument()
    expect(tableRows()).toEqual([
      ['Jan', '5000 INR', '3000 INR'],
      ['Feb', '6000 INR', '3500 INR'],
    ])
  })

  it('uses formatted legend names and currency values in the line-chart table', () => {
    render(
      <TimeSeriesLineChart
        chartData={[{ displayPeriod: 'Jan 26', salary: 1000, bonus: 250 }]}
        seriesKeys={['salary', 'bonus']}
        colors={['#000000', '#111111']}
        legendFormatter={(value) => value.toUpperCase()}
        ariaLabel="Income sources"
      />,
    )

    expect(screen.getByRole('columnheader', { name: 'SALARY' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'BONUS' })).toBeInTheDocument()
    expect(tableRows()).toEqual([['Jan 26', '₹1,000', '₹250']])
  })

  it('exposes radar dimensions and scores without relying on the SVG', () => {
    render(
      <StandardRadarChart
        data={[
          { dimension: 'Savings', score: 82 },
          { dimension: 'Debt', score: 65 },
        ]}
        dataKey="score"
        categoryKey="dimension"
        color="#000000"
        name="Health score"
        ariaLabel="Financial health dimensions"
      />,
    )

    expect(
      screen.getByRole('img', { name: 'Financial health dimensions' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Dimension' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Health score' })).toBeInTheDocument()
    expect(tableRows()).toEqual([
      ['Savings', '82'],
      ['Debt', '65'],
    ])
  })
})

describe('chart tooltip readings', () => {
  it('announces keyboard readings when chart accessibility is enabled', () => {
    const { rerender } = render(
      <ChartTooltipContent
        active
        accessibilityLayer
        label="Jan 26"
        payload={[{ graphicalItemId: 'income', name: 'Income', value: 10 }]}
      />,
    )

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'assertive')
    expect(screen.getByRole('status')).toHaveTextContent('Jan 26')
    rerender(
      <ChartTooltipContent
        active
        accessibilityLayer
        label="Feb 26"
        payload={[{ graphicalItemId: 'income', name: 'Income', value: 20 }]}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Feb 26')
    expect(screen.getByRole('status')).not.toHaveTextContent('Jan 26')
  })

  it.each([null, undefined])('omits readings suppressed by a formatter returning %s', (suppressed) => {
    render(
      <ChartTooltipContent
        active
        payload={[
          { graphicalItemId: 'hidden', name: 'Hidden series', value: 25, formatter: () => suppressed },
          { graphicalItemId: 'visible', name: 'Visible series', value: 42 },
        ]}
        formatter={(value) => `${String(value)} INR`}
      />,
    )

    expect(screen.queryByText('Hidden series')).not.toBeInTheDocument()
    expect(screen.queryByText('25')).not.toBeInTheDocument()
    expect(screen.getByText('Visible series')).toBeInTheDocument()
    expect(screen.getByText('42 INR')).toBeInTheDocument()
  })

  it('preserves signed and zero values through the supplied formatter', () => {
    render(
      <ChartTooltipContent
        active
        label="Jan 26"
        payload={[
          { graphicalItemId: 'income', name: 'Income', value: 0 },
          { graphicalItemId: 'expense', name: 'Expense', value: -42 },
        ]}
        formatter={(value) => `${typeof value === 'number' ? value : 0} INR`}
      />,
    )

    const tooltip = screen.getByRole('tooltip')
    expect(within(tooltip).getByText('Jan 26')).toBeInTheDocument()
    expect(within(tooltip).getByText('0 INR')).toBeInTheDocument()
    expect(within(tooltip).getByText('-42 INR')).toBeInTheDocument()
  })

  it('keeps the row payload and tuple label returned by an advanced formatter', () => {
    render(
      <ChartTooltipContent
        active
        payload={[
          { graphicalItemId: 'score', name: 'Raw score', value: 7, payload: { average: 12 } },
        ]}
        formatter={(value, _name, entry) => {
          const row = entry.payload as { average: number }
          return [`${String(value)} / average ${row.average}`, 'Household score']
        }}
      />,
    )

    expect(screen.getByText('7 / average 12')).toBeInTheDocument()
    expect(screen.getByText('Household score')).toBeInTheDocument()
    expect(screen.queryByText('Raw score')).not.toBeInTheDocument()
  })

  it('computes shares independently of formatted amounts', () => {
    render(
      <ChartTooltipContent
        active
        shareTotal={100}
        payload={[{ graphicalItemId: 'pie', name: 'Rent', value: 25 }]}
        formatter={() => '25 units'}
      />,
    )

    expect(screen.getByText('25 units')).toBeInTheDocument()
    expect(screen.getByText('25.0% of total')).toBeInTheDocument()
  })
})

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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

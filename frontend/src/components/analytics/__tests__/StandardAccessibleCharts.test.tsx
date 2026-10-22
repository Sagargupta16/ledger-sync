import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'


import StandardAreaChart from '../StandardAreaChart'
import StandardRadarChart from '../StandardRadarChart'
import TimeSeriesLineChart from '../TimeSeriesLineChart'

function tableRows(): string[][] {
  return Array.from(screen.getByRole('table').querySelectorAll('tbody tr')).map((row) =>
    Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent ?? ''),
  )
}

/** Stroked series paths of one colour inside the named chart. */
function strokesIn(chart: string, color: string): number {
  return screen.getByRole('img', { name: chart }).querySelectorAll(`path[stroke="${color}"]`).length
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
    expect(tableRows()).toEqual([['January 2026', '₹1,000.00', '₹250.00']])
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

describe('legend series toggles', () => {
  it('hides an area series from the plot, keeping its legend reading and table column', () => {
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
    expect(strokesIn('Monthly cash flow', '#111111')).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Expense 3500 INR' }))

    expect(screen.getByRole('button', { name: 'Expense 3500 INR' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Income 6000 INR' })).toHaveAttribute('aria-disabled', 'true')
    expect(strokesIn('Monthly cash flow', '#111111')).toBe(0)
    expect(strokesIn('Monthly cash flow', '#000000')).toBe(1)
    expect(tableRows()).toEqual([
      ['Jan', '5000 INR', '3000 INR'],
      ['Feb', '6000 INR', '3500 INR'],
    ])
  })

  it('keeps each line in its own colour when an earlier series is hidden', () => {
    render(
      <TimeSeriesLineChart
        chartData={[
          { displayPeriod: 'Jan 26', salary: 1000, bonus: 250 },
          { displayPeriod: 'Feb 26', salary: 1100, bonus: 300 },
        ]}
        seriesKeys={['salary', 'bonus']}
        colors={['#000000', '#111111']}
        ariaLabel="Income sources"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^salary/ }))

    expect(strokesIn('Income sources', '#000000')).toBe(0)
    expect(strokesIn('Income sources', '#111111')).toBe(1)
    expect(screen.getByRole('columnheader', { name: 'salary' })).toBeInTheDocument()
    expect(tableRows()).toEqual([
      ['January 2026', '₹1,000.00', '₹250.00'],
      ['February 2026', '₹1,100.00', '₹300.00'],
    ])
  })
})

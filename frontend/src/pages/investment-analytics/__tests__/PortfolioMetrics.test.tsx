import type { ComponentProps } from 'react'

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { PortfolioMetrics } from '../components/PortfolioMetrics'

/**
 * The fourth card was "Cashflow XIRR". Its terminal cash flow was the book value
 * those very contributions summed to (the backend derives investment holdings
 * from flows -- see core/analytics/net_worth.py, "No market data is available"),
 * so the solved rate described the arithmetic, not the portfolio. On real data it
 * printed a confident -2.88% p.a.
 */
type Props = ComponentProps<typeof PortfolioMetrics>

const baseProps: Props = {
  totalInvestmentValue: 1651554.14,
  investmentAccountsCount: 7,
  netInvestmentPL: 1311.56,
  plPercent: 0.08,
  topHolding: { name: 'Grow Mutual Funds', value: 912311.43 },
  monthlyInvestmentTarget: 0,
  currentMonthInvestment: 0,
  targetProgress: 0,
  isLoading: false,
}

function renderMetrics(props: Partial<Props> = {}) {
  return render(
    <MemoryRouter>
      <PortfolioMetrics {...baseProps} {...props} />
    </MemoryRouter>,
  )
}

describe('PortfolioMetrics', () => {
  it('renders no XIRR or annualised-rate card', () => {
    renderMetrics()
    expect(screen.queryByText(/XIRR/i)).toBeNull()
    expect(screen.queryByText(/p\.a\./i)).toBeNull()
    expect(screen.queryByText(/Cashflow/i)).toBeNull()
  })

  it('shows allocation concentration in that slot instead', () => {
    renderMetrics()
    expect(screen.getByText('Largest Holding')).toBeInTheDocument()
    // Amount contributed to the biggest account, and its share of total invested.
    expect(screen.getByText(/Grow Mutual Funds/)).toBeInTheDocument()
    expect(screen.getByText(/of invested/)).toBeInTheDocument()
  })

  it('keeps every cost-basis metric the statements do support', () => {
    renderMetrics()
    expect(screen.getByText('Total Investment Value')).toBeInTheDocument()
    expect(screen.getByText('Net contributions (book value)')).toBeInTheDocument()
    expect(screen.getByText('Portfolio Assets')).toBeInTheDocument()
    expect(screen.getByText('Net Investment P&L')).toBeInTheDocument()
  })

  it('degrades to a dash rather than a fake figure when there are no holdings', () => {
    renderMetrics({ topHolding: null, totalInvestmentValue: 0 })
    expect(screen.getByText('No holdings yet')).toBeInTheDocument()
  })
})

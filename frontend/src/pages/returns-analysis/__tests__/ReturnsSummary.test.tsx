import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ReturnsSummary from '../components/ReturnsSummary'

/**
 * The summary row used to lead with "CAGR" and "Monthly ROI", both computed from
 * monthly total income (salary) rather than investments. On the owner's real
 * ledger, default FY window, they rendered -99.99% and -54.23%.
 */
describe('ReturnsSummary', () => {
  const props = {
    netProfitLoss: 1311.56,
    totalIncome: 2755.18,
    totalExpenses: 968.62,
    realisedEventCount: 4,
  }

  it('shows no CAGR or ROI figure', () => {
    render(<ReturnsSummary {...props} />)
    expect(screen.queryByText(/CAGR/i)).toBeNull()
    expect(screen.queryByText(/ROI/i)).toBeNull()
    // No percentage anywhere in the stat row: every remaining figure is cash or a count.
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('keeps the realised cash facts and shows the event count instead', () => {
    render(<ReturnsSummary {...props} />)
    expect(screen.getByText('Realised Income')).toBeInTheDocument()
    expect(screen.getByText('Realised Costs')).toBeInTheDocument()
    expect(screen.getByText('Booked Events')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    // The headline P&L is a real sum over booked rows and must survive.
    expect(screen.getByText('Net Investment P&L')).toBeInTheDocument()
  })
})

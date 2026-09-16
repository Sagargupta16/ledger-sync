import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import WithholdingSummary from '../WithholdingSummary'

describe('withholding estimates and missing actuals', () => {
  it('explains incomplete share withholding when ledger receipts exceed configured vests', () => {
    render(<WithholdingSummary salaryMonths={5} estimate={{
      taxPaid: 199_250, incomeReceived: 1_250_000, baseAccrued: 1_250_000,
      bonusGross: 0, bonusNet: 0, cashBonusGross: 0,
      cashTaxPaid: 199_250, rsuGrossIncome: 0, netShareValue: 0,
      rsuWithholding: 0, rsuRecordedWithholding: 0, rsuEstimatedWithholding: 0,
      unmatchedRsuNetReceipts: 500_000,
    }} />)
    expect(screen.getByRole('region', { name: 'Withholding to date' }))
      .toHaveTextContent('Incomplete RSU estimate: ₹5,00,000.00')
  })

  it('separates payroll and shares without presenting an estimate as actual TDS', () => {
    render(<WithholdingSummary salaryMonths={5} estimate={{
      taxPaid: 277_250, incomeReceived: 1_500_000, baseAccrued: 1_250_000,
      bonusGross: 250_000, bonusNet: 172_000, cashBonusGross: 0,
      cashTaxPaid: 199_250, rsuGrossIncome: 250_000, netShareValue: 172_000,
      rsuWithholding: 78_000, rsuRecordedWithholding: 0, rsuEstimatedWithholding: 78_000,
    }} />)

    const summary = screen.getByRole('region', { name: 'Withholding to date' })
    expect(within(summary).getByText('5 recorded salary months')).toBeInTheDocument()
    expect(within(summary).getByText('₹1,99,250.00')).toBeInTheDocument()
    expect(within(summary).getByText('₹2,77,250.00')).toBeInTheDocument()
    expect(within(summary).getByLabelText('Actual payroll TDS not recorded')).toHaveTextContent('--')
    expect(summary).toHaveTextContent('30% tax plus 4% cess on the tax')
    expect(summary).toHaveTextContent('₹0.00 recorded; ₹78,000.00 estimated')
  })
})

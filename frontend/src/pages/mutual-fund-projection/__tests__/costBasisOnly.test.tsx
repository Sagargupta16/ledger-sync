import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OverviewCards } from '../components/OverviewCards'
import { ReturnsAnalysisSection } from '../components/ReturnsAnalysisSection'
import { computeGainsDisplay } from '../projectionUtils'

/**
 * "Realized Gain" was `currentBalance - totalHistoricalInvested`. The backend
 * derives account balances from cash flows only, so the balance IS the sum of
 * those contributions and the difference was just stray income/expense rows on
 * the account: measured 912,311.43 - 911,000.00 = 1,311.43, shown as +0.14%.
 */
describe('OverviewCards', () => {
  const props = {
    isLoading: false,
    currentBalance: 912311.43,
    primaryAccountName: 'Grow Mutual Funds',
    detectedMonthlySIP: 35000,
    transactionCount: 26,
    totalHistoricalInvested: 911000,
    investmentDurationYears: 1.98,
  }

  it('shows no realized gain or return percentage', () => {
    render(<OverviewCards {...props} />)
    expect(screen.queryByText(/Realized Gain/i)).toBeNull()
    expect(screen.queryByText(/returns/i)).toBeNull()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('reports the contribution span the ledger does support', () => {
    render(<OverviewCards {...props} />)
    expect(screen.getByText('Contributing Since')).toBeInTheDocument()
    // 1.98 years -> 24 months.
    expect(screen.getByText('24 mo')).toBeInTheDocument()
    expect(screen.getByText(/avg \/ month/)).toBeInTheDocument()
  })

  it('keeps the real cost-basis cards', () => {
    render(<OverviewCards {...props} />)
    expect(screen.getByText('Current Balance')).toBeInTheDocument()
    expect(screen.getByText('Monthly SIP')).toBeInTheDocument()
    expect(screen.getByText('Total Invested')).toBeInTheDocument()
    expect(screen.getByText('Actual contributions')).toBeInTheDocument()
  })

  it('does not divide by zero when there is no contribution history', () => {
    render(<OverviewCards {...props} totalHistoricalInvested={0} investmentDurationYears={0} />)
    expect(screen.getByText('0 mo')).toBeInTheDocument()
  })
})

describe('ReturnsAnalysisSection', () => {
  const props = {
    currentValueInput: 0,
    currentBalance: 912311.43,
    onCurrentValueChange: () => {},
    overrideGainsPercent: 0.1439,
    overrideGains: 1311.43,
    totalHistoricalInvested: 911000,
    xirrPercent: 0.15,
    investmentDurationYears: 1.98,
    effectiveCurrentValue: 912311.43,
    currentValueLabel: 'Using portfolio balance',
    effectiveValueLabel: 'From portfolio',
    totalReturnColorClass: 'text-app-green',
    totalReturnSignPrefix: '+',
    xirrColorClass: 'text-app-green',
    xirrSignPrefix: '+',
    hasCurrentValueOverride: false,
  }

  it('prompts for a market value instead of printing a residue rate', () => {
    render(<ReturnsAnalysisSection {...props} />)
    // The labels stay so the concept is explained, not silently dropped...
    expect(screen.getByText('Total Return')).toBeInTheDocument()
    expect(screen.getByText('Annualized Return (XIRR)')).toBeInTheDocument()
    // ...but neither figure is shown while the "current value" is only the book balance.
    expect(screen.getByText('Enter a current value to compute')).toBeInTheDocument()
    expect(screen.getByText('Needs a current value, not just contributions')).toBeInTheDocument()
    expect(screen.queryByText(/0\.14%/)).toBeNull()
    expect(screen.queryByText(/0\.15% p\.a\./)).toBeNull()
  })

  it('still prompts when a value is entered but nothing was ever contributed', () => {
    // Observed live at /demo: entering 1,050,000 against 0 contributions printed
    // "Total Return +0.00% -- Rs 10,50,000 on Rs 0" and "+0.00% p.a. over 0.0
    // years". A rate needs a denominator, so the hook now requires both a market
    // value and a contribution base before either tile shows a number.
    render(
      <ReturnsAnalysisSection
        {...props}
        currentValueInput={1050000}
        totalHistoricalInvested={0}
        overrideGainsPercent={0}
        xirrPercent={0}
        investmentDurationYears={0}
        hasCurrentValueOverride={false}
      />,
    )
    expect(screen.getByText('Enter a current value to compute')).toBeInTheDocument()
    expect(screen.queryByText(/\+0\.00%/)).toBeNull()
  })

  it('computes both for real once the user supplies a current value', () => {
    render(
      <ReturnsAnalysisSection
        {...props}
        hasCurrentValueOverride
        currentValueInput={1050000}
        overrideGainsPercent={15.26}
        xirrPercent={14.4}
      />,
    )
    expect(screen.getByTitle('+15.26%')).toBeInTheDocument()
    expect(screen.getByTitle('+14.40% p.a.')).toBeInTheDocument()
    expect(screen.queryByText('Enter a current value to compute')).toBeNull()
  })
})

describe('computeGainsDisplay', () => {
  it('takes only the two override-driven rates', () => {
    // Reverting the fix restores the 4-arg realizedGains signature.
    expect(computeGainsDisplay).toHaveLength(2)
    const display = computeGainsDisplay(15.26, 14.4)
    expect(Object.keys(display).sort()).toEqual([
      'totalReturnColorClass',
      'totalReturnSignPrefix',
      'xirrColorClass',
      'xirrSignPrefix',
    ])
    expect(display).toMatchObject({
      totalReturnColorClass: 'text-app-green',
      totalReturnSignPrefix: '+',
      xirrColorClass: 'text-app-green',
      xirrSignPrefix: '+',
    })
  })

  it('flips to the loss colour without a sign prefix on negative rates', () => {
    const display = computeGainsDisplay(-8.1, -3.4)
    expect(display.totalReturnColorClass).toBe('text-app-red')
    expect(display.totalReturnSignPrefix).toBe('')
    expect(display.xirrColorClass).toBe('text-app-red')
    expect(display.xirrSignPrefix).toBe('')
  })

  it('exposes no realized-gain classes at all', () => {
    const keys = Object.keys(computeGainsDisplay(1, 1))
    expect(keys.filter((k) => /gains(Bg|Icon|Text)Class|gainsSignPrefix/.test(k))).toEqual([])
  })
})

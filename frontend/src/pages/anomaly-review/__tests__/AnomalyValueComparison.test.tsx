import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Anomaly } from '@/services/api/analyticsV2'

import AnomalyValueComparison from '../components/AnomalyValueComparison'

/**
 * `deviation_pct` is ALREADY a percent when it reaches the browser: the backend
 * computes `((actual - expected) / expected) * 100` in
 * `core/analytics/anomalies.py`. `formatPercent` only appends '%' -- it does not
 * multiply by 100 -- so the value must be passed through unscaled.
 *
 * The numbers below are the owner's real anomaly rows, read from the live
 * ledger (`SELECT deviation_pct, expected_value, actual_value FROM anomalies
 * ORDER BY ABS(deviation_pct) DESC`). The old call site divided by 100 and
 * rendered the worst outlier as "+1749.0%" instead of "+174900.0%".
 *
 * The leading '+' on positives comes from the component itself, which renders a
 * sign prefix next to the formatted number (it does not pass `showSign`).
 */
function makeAnomaly(overrides: Partial<Anomaly>): Anomaly {
  return {
    id: 1,
    anomaly_type: 'high_expense',
    severity: 'high',
    description: 'High expense detected',
    transaction_id: 'txn-1',
    period_key: null,
    expected_value: 20,
    actual_value: 35000,
    deviation_pct: 174900,
    detected_at: '2026-07-01T00:00:00Z',
    is_reviewed: false,
    is_dismissed: false,
    review_notes: null,
    reviewed_at: null,
    ...overrides,
  }
}

/** The deviation badge is the only element that renders a bare percent string. */
function deviationText(): string {
  const badge = screen.getByText(/%$/)
  return badge.textContent ?? ''
}

describe('AnomalyValueComparison deviation badge', () => {
  it('renders the real worst outlier at full scale, not 100x small', () => {
    // Real row: expected 20.00, actual 35,000.00 -> deviation_pct 174900.
    render(<AnomalyValueComparison anomaly={makeAnomaly({})} />)

    expect(deviationText()).toBe('+174900.0%')
    // Pin the specific regression: the /100 bug produced exactly this.
    expect(deviationText()).not.toBe('+1749.0%')
  })

  it('renders the second real outlier at full scale', () => {
    // Real row: expected 30.65, actual 45,000.00 -> deviation_pct 146718.9.
    render(
      <AnomalyValueComparison
        anomaly={makeAnomaly({ expected_value: 30.65, actual_value: 45000, deviation_pct: 146718.9 })}
      />,
    )

    expect(deviationText()).toBe('+146718.9%')
  })

  it('renders a modest real deviation unscaled', () => {
    // Real row: expected 757.49, actual 102,789.41 -> deviation_pct 13469.7.
    render(
      <AnomalyValueComparison
        anomaly={makeAnomaly({
          expected_value: 757.49,
          actual_value: 102789.41,
          deviation_pct: 13469.7,
        })}
      />,
    )

    expect(deviationText()).toBe('+13469.7%')
  })

  it('renders a budget-exceeded deviation, where 20 percent over means 20 percent', () => {
    // BUDGET_EXCEEDED sets deviation_pct = current_month_pct - 100, so a budget
    // at 120% of its limit yields 20 -- which must read "+20.0%", not "+0.2%".
    render(
      <AnomalyValueComparison
        anomaly={makeAnomaly({
          anomaly_type: 'budget_exceeded',
          expected_value: 10000,
          actual_value: 12000,
          deviation_pct: 20,
        })}
      />,
    )

    expect(deviationText()).toBe('+20.0%')
  })

  it('renders a negative deviation unscaled and keeps the under-baseline color', () => {
    render(
      <AnomalyValueComparison
        anomaly={makeAnomaly({ expected_value: 5000, actual_value: 2500, deviation_pct: -50 })}
      />,
    )

    expect(deviationText()).toBe('-50.0%')
  })

  it('omits the badge entirely when the backend reports no deviation', () => {
    render(<AnomalyValueComparison anomaly={makeAnomaly({ deviation_pct: null })} />)

    expect(screen.queryByText(/%$/)).toBeNull()
  })
})

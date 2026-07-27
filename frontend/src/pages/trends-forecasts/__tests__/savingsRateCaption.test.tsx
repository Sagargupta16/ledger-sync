/**
 * Guards the caption on the Savings Rate Trend chart.
 *
 * It read "(% of income saved each month)". The series is cumulative to date --
 * each point is every rupee earned and spent from the start of the window up to
 * that day -- which is what the tooltip says ("Cumulative Savings Rate"), what
 * the accessible name says, what `dailySavingsData` computes, and what three
 * tests in `savingsRateCap.test.tsx` pin. Read as monthly, a converging line
 * looks like a month that stopped changing, and the axis is dates rather than
 * months so nothing else on the card corrects it.
 *
 * This is a LABEL fix: the maths is deliberate and stays. So the caption is
 * asserted together with the two strings that already described the series
 * correctly, because agreeing with them is the property that matters.
 */

import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import SavingsRateSection from '../components/SavingsRateSection'

/**
 * jsdom has no IntersectionObserver and the section root uses motion's
 * `whileInView`, which constructs one on mount. Children render either way --
 * only the entry animation is skipped.
 */
beforeAll(() => {
  if (globalThis.IntersectionObserver === undefined) {
    class NoopIntersectionObserver implements IntersectionObserver {
      readonly root = null
      readonly rootMargin = ''
      readonly scrollMargin = ''
      readonly thresholds: readonly number[] = []
      disconnect() {}
      observe() {}
      unobserve() {}
      takeRecords(): IntersectionObserverEntry[] {
        return []
      }
    }
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      value: NoopIntersectionObserver,
      writable: true,
    })
  }
})

/**
 * A cumulative to-date series: the rate converges as the denominator grows, it
 * does not restart each month. Two points inside one month plus one in the next,
 * which is the shape a per-month reading cannot account for.
 */
const DATA = [
  { date: '2026-06-10', savingsRate: 60 },
  { date: '2026-06-30', savingsRate: 45 },
  { date: '2026-07-10', savingsRate: 30 },
]

function renderSection() {
  return render(
    <SavingsRateSection isLoading={false} data={DATA} savingsGoalPercent={20} />,
  )
}

describe('SavingsRateSection caption', () => {
  it('describes the series as running to date, not as a per-month rate', () => {
    renderSection()

    expect(
      screen.getByText('(running % of income saved, start of range to date)'),
    ).toBeInTheDocument()
    expect(screen.queryByText('(% of income saved each month)')).not.toBeInTheDocument()
  })

  it('never calls the series monthly anywhere in the card', () => {
    // Broader than the exact string: any "each month" / "per month" phrasing
    // beside a cumulative line is the same defect wearing different words.
    const { container } = renderSection()

    expect(container.textContent).not.toMatch(/each month|per month|monthly/i)
  })

  it('agrees with the accessible name and the tooltip series name', () => {
    // These two already said "cumulative" while the caption said "each month",
    // so the card shipped two contradictory descriptions of one series. Pinning
    // them together is what stops the caption drifting back.
    renderSection()

    expect(
      screen.getByRole('img', {
        name: 'Cumulative savings rate over time as a percentage of income, with savings-goal target line',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/running % of income saved/)).toBeInTheDocument()
  })
})

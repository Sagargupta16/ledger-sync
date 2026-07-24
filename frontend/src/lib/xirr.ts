/**
 * XIRR -- extended internal rate of return for irregular cash flows.
 *
 * Use when cash-flow timing matters (not just amount). For a portfolio with
 * scattered SIP / lumpsum / withdrawal events, XIRR is the canonical
 * "annualized return" number.
 *
 * Newton-Raphson with bisection fallback. Newton converges in a handful of
 * iterations near the root, but on loss-making portfolios it overshoots below
 * -100% en route and the old "return 0 on divergence" guard reported a plain
 * 45%-loss year as 0% -- a losing portfolio silently displayed as flat. When
 * Newton leaves the bracket (or oscillates), we now fall back to bisection on
 * [-99.99%, 1000%], which is guaranteed to converge whenever NPV changes sign
 * across the bracket (always true for a real portfolio: all-in flows make
 * NPV -> +inf as rate -> -1, and NPV -> first-flow sign as rate -> inf).
 *
 * Returns the rate as a PERCENT (e.g. 12.5 means 12.5 % / year). Returns 0
 * when there are fewer than 2 cashflows or no sign change exists in the
 * bracket (degenerate flows, e.g. all inflows).
 *
 * Convention: positive amount = cash INTO the investment (buy / SIP),
 * negative amount = cash OUT (withdrawal / current value treated as an
 * outflow on the end date). This matches Excel's XIRR.
 */

import { MS_PER_YEAR } from '@/lib/dateUtils'

export interface CashFlow {
  date: Date
  /** Positive = money in, negative = money out. */
  amount: number
}

const RATE_MIN = -0.9999
const RATE_MAX = 10

interface TimedCashFlow {
  years: number
  amount: number
}

function calculateNpv(flows: readonly TimedCashFlow[], rate: number): number {
  let npv = 0
  for (const flow of flows) {
    npv += flow.amount / Math.pow(1 + rate, flow.years)
  }
  return npv
}

function calculateNpvAndDerivative(
  flows: readonly TimedCashFlow[],
  rate: number,
): { npv: number; derivative: number } {
  let npv = 0
  let derivative = 0
  for (const flow of flows) {
    const factor = Math.pow(1 + rate, flow.years)
    npv += flow.amount / factor
    if (flow.years !== 0) {
      derivative -= (flow.years * flow.amount) / (factor * (1 + rate))
    }
  }
  return { npv, derivative }
}

function solveWithNewton(
  flows: readonly TimedCashFlow[],
  guess: number,
  maxIterations: number,
  tolerance: number,
): number | null {
  let rate = guess
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const { npv, derivative } = calculateNpvAndDerivative(flows, rate)
    if (Math.abs(derivative) < 1e-12) return null

    const nextRate = rate - npv / derivative
    if (Math.abs(nextRate - rate) < tolerance) {
      return nextRate > RATE_MIN && nextRate < RATE_MAX ? nextRate : null
    }
    if (nextRate <= RATE_MIN || nextRate >= RATE_MAX) return null
    rate = nextRate
  }
  return null
}

function solveWithBisection(
  flows: readonly TimedCashFlow[],
  tolerance: number,
): number | null {
  let low = RATE_MIN
  let high = RATE_MAX
  let lowNpv = calculateNpv(flows, low)
  let highNpv = calculateNpv(flows, high)
  if (!Number.isFinite(lowNpv) || !Number.isFinite(highNpv)) return null

  while (lowNpv * highNpv > 0 && high < 1e9) {
    high *= 10
    highNpv = calculateNpv(flows, high)
    if (!Number.isFinite(highNpv)) return null
  }
  if (lowNpv * highNpv > 0) return null

  for (let iteration = 0; iteration < 200; iteration++) {
    const midpoint = (low + high) / 2
    const midpointNpv = calculateNpv(flows, midpoint)
    if (Math.abs(midpointNpv) < tolerance || (high - low) / 2 < tolerance) {
      return midpoint
    }
    if (lowNpv * midpointNpv < 0) {
      high = midpoint
    } else {
      low = midpoint
      lowNpv = midpointNpv
    }
  }
  return (low + high) / 2
}

export function calculateXIRR(
  cashFlows: readonly CashFlow[],
  guess = 0.1,
  maxIterations = 100,
  tolerance = 1e-7,
): number {
  if (cashFlows.length < 2) return 0

  const firstDate = cashFlows[0].date
  const flows = cashFlows.map((cf) => ({
    years: (cf.date.getTime() - firstDate.getTime()) / MS_PER_YEAR,
    amount: cf.amount,
  }))

  const newtonRate = solveWithNewton(flows, guess, maxIterations, tolerance)
  if (newtonRate !== null) return newtonRate * 100

  const bisectionRate = solveWithBisection(flows, tolerance)
  return bisectionRate === null ? 0 : bisectionRate * 100
}

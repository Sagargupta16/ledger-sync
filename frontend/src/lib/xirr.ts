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
 * Returns the rate as a PERCENT (e.g. 12.5 means 12.5 % / year). When the flows
 * span less than 365 days it returns the ABSOLUTE (non-annualised) return
 * instead, the SEBI/AMFI convention for sub-year periods. Returns 0 when there
 * are fewer than 2 cashflows or no sign change exists (degenerate flows, e.g.
 * all inflows). Losses deeper than -99.99% a year solve toward -100%.
 *
 * Convention: positive amount = cash INTO the investment (buy / SIP),
 * negative amount = cash OUT (withdrawal / current value treated as an
 * outflow on the end date). This matches Excel's XIRR.
 */

import { MS_PER_DAY, MS_PER_YEAR } from '@/lib/dateUtils'

export interface CashFlow {
  date: Date
  /** Positive = money in, negative = money out. */
  amount: number
}

const RATE_MIN = -0.9999
const RATE_MAX = 10
/** Below one year a rate is not annualised (a 10-day +30% would read as 1,451,279% p.a.). */
export const MIN_ANNUALISED_SPAN_DAYS = 365

/**
 * Gain over total invested, for spans too short to annualise. The first flow is
 * always a contribution, so flows sharing its sign are money in and the rest is
 * money out, whichever sign convention the caller uses.
 */
function absoluteReturnPercent(cashFlows: readonly CashFlow[]): number {
  const inSign = Math.sign(cashFlows[0].amount)
  let invested = 0
  let returned = 0
  for (const cf of cashFlows) {
    if (Math.sign(cf.amount) === inSign) invested += Math.abs(cf.amount)
    else returned += Math.abs(cf.amount)
  }
  if (invested === 0 || returned === 0) return 0
  return ((returned - invested) / invested) * 100
}

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

interface RateBound {
  rate: number
  npv: number
}

/**
 * A loss deeper than -99.99% a year has its root below RATE_MIN; walk the
 * lower bound toward -100% so it solves instead of reporting a flat 0%.
 */
function extendLowerBound(flows: readonly TimedCashFlow[], low: RateBound, highNpv: number): RateBound {
  let bound = low
  while (bound.npv * highNpv > 0 && 1 + bound.rate > 1e-12) {
    const rate = -1 + (1 + bound.rate) / 10
    const npv = calculateNpv(flows, rate)
    if (!Number.isFinite(npv)) break
    bound = { rate, npv }
  }
  return bound
}

/** Grow the upper bound until the bracket changes sign; null when NPV stops being finite. */
function extendUpperBound(flows: readonly TimedCashFlow[], high: RateBound, lowNpv: number): RateBound | null {
  let bound = high
  while (lowNpv * bound.npv > 0 && bound.rate < 1e9) {
    const rate = bound.rate * 10
    const npv = calculateNpv(flows, rate)
    if (!Number.isFinite(npv)) return null
    bound = { rate, npv }
  }
  return bound
}

function solveWithBisection(
  flows: readonly TimedCashFlow[],
  tolerance: number,
): number | null {
  const initialLowNpv = calculateNpv(flows, RATE_MIN)
  const initialHighNpv = calculateNpv(flows, RATE_MAX)
  if (!Number.isFinite(initialLowNpv) || !Number.isFinite(initialHighNpv)) return null

  const lowBound = extendLowerBound(flows, { rate: RATE_MIN, npv: initialLowNpv }, initialHighNpv)
  const highBound = extendUpperBound(flows, { rate: RATE_MAX, npv: initialHighNpv }, lowBound.npv)
  if (highBound === null || lowBound.npv * highBound.npv > 0) return null

  let low = lowBound.rate
  let lowNpv = lowBound.npv
  let high = highBound.rate
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

  const times = cashFlows.map((cf) => cf.date.getTime())
  const spanDays = (Math.max(...times) - Math.min(...times)) / MS_PER_DAY
  if (spanDays < MIN_ANNUALISED_SPAN_DAYS) return absoluteReturnPercent(cashFlows)

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

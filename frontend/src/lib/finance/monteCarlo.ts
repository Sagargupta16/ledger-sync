/**
 * Seeded Monte Carlo for the FIRE calculator: does the money last to the end age?
 *
 * Each run steps one year at a time from today's age. Before retirement the
 * year's savings land at its end; from retirement the year's spending leaves at
 * its start, and a run fails in the first year the portfolio cannot fund it.
 * The stress test's equity fall lands as retirement starts, so the balance at
 * the retirement age already includes it. Savings and spending are in today's
 * rupees and grow with that run's inflation, so every reported balance is
 * deflated back to today's rupees.
 *
 * Each pot draws a lognormal annual return whose median is its expected return
 * (a CAGR) and whose standard deviation is its volatility; inflation draws from
 * a normal around its average. The portfolio is rebalanced to the starting mix
 * every year, and pots and inflation move independently. Nothing resamples US
 * market history: INR returns and inflation are the user's assumptions.
 *
 * Deterministic: run r draws from its own generator seeded by (seed, r) in the
 * same order every year, so the same inputs give the same fan, more runs extend
 * the same set, and moving an age leaves every other year's draws alone.
 */

import { normalSampler, seededUniform } from './seededRandom'

export type PotId = 'equity' | 'debt' | 'cash'

export interface MonteCarloPot {
  readonly id: PotId
  /** Starting balance in today's rupees. */
  readonly balance: number
  /** Median nominal annual return as a fraction (0.12 = 12%). */
  readonly expectedReturn: number
  /** Standard deviation of annual returns as a fraction. */
  readonly volatility: number
}

export interface MonteCarloInputs {
  readonly pots: readonly MonteCarloPot[]
  readonly currentAge: number
  readonly retireAge: number
  readonly endAge: number
  /** Added each year before retirement, today's rupees. */
  readonly annualSavings: number
  /** Spent each year from retirement, today's rupees. */
  readonly annualSpending: number
  /** Average yearly INR inflation and its standard deviation, as fractions. */
  readonly inflation: number
  readonly inflationVolatility: number
  readonly runs: number
  readonly seed: number
  /** One-time fall in the equity pot as retirement starts (0.3 = 30%); 0 for none. */
  readonly equityDrawdown: number
}

/** Balance percentiles across runs at one age, today's rupees. */
export interface FanRow {
  readonly age: number
  readonly p10: number
  readonly p25: number
  readonly p50: number
  readonly p75: number
  readonly p90: number
  /** Share of runs already out of money before this age, 0 to 1. */
  readonly depleted: number
}

export interface MonteCarloResult {
  readonly runs: number
  readonly successRate: number
  /** Median balance at the end age; failed runs count as 0. */
  readonly medianEnding: number
  /** Median balance as retirement starts: after any equity fall, before the first year's spending. */
  readonly medianAtRetirement: number
  /** Ages failed runs ran out at: the median and the earliest tenth. Null when none failed. */
  readonly failureAge: { readonly median: number; readonly earlyTenth: number } | null
  /** The same runs without the drawdown; null when no drawdown is set. */
  readonly successWithoutDrawdown: number | null
  readonly fan: readonly FanRow[]
}

export interface MonteCarloRequest {
  readonly id: number
  readonly inputs: MonteCarloInputs
}

export type MonteCarloResponse =
  | { readonly id: number; readonly result: MonteCarloResult }
  | { readonly id: number; readonly error: string }

/** Mix used when no pot holds a positive balance to take one from. */
export const FALLBACK_MIX: Readonly<Record<PotId, number>> = { equity: 0.6, debt: 0.3, cash: 0.1 }
export const MAX_RUNS = 20_000

/** Log-space mean and sd for a return with median `expected` and standard deviation `volatility`. */
function logReturn(expected: number, volatility: number) {
  const mu = Math.log(1 + Math.max(-0.99, expected))
  const spread = (1 + Math.sqrt(1 + 4 * volatility ** 2 * Math.exp(-2 * mu))) / 2
  return { mu, sigma: Math.sqrt(Math.log(spread)) }
}

interface Plan {
  readonly years: number
  readonly retireYear: number
  readonly start: number
  readonly weights: readonly number[]
  readonly params: readonly { readonly mu: number; readonly sigma: number }[]
  readonly equityShare: number
}

function buildPlan(inputs: MonteCarloInputs): Plan {
  const currentAge = Math.round(inputs.currentAge)
  const years = Math.min(100, Math.max(1, Math.round(inputs.endAge) - currentAge))
  const retireYear = Math.min(years, Math.max(0, Math.round(inputs.retireAge) - currentAge))
  const balances = inputs.pots.map((pot) => Math.max(0, pot.balance))
  const start = balances.reduce((sum, value) => sum + value, 0)
  const raw = start > 0 ? balances : inputs.pots.map((pot) => FALLBACK_MIX[pot.id])
  const total = raw.reduce((sum, value) => sum + value, 0) || 1
  const weights = raw.map((value) => value / total)
  const equityShare = inputs.pots.reduce((share, pot, i) => share + (pot.id === 'equity' ? weights[i] : 0), 0)
  const params = inputs.pots.map((pot) => logReturn(pot.expectedReturn, Math.max(0, pot.volatility)))
  return { years, retireYear, start, weights, params, equityShare }
}

/**
 * One run: the year index it ran out in, or -1. Writes real balances into
 * `track` when given; a failed run leaves its later years at zero.
 */
function simulateRun(inputs: MonteCarloInputs, plan: Plan, run: number, drawdown: number, track?: Float64Array[]): number {
  const normal = normalSampler(seededUniform(inputs.seed, run))
  const savings = Math.max(0, inputs.annualSavings)
  const spending = Math.max(0, inputs.annualSpending)
  // The equity fall, applied once at the retirement age before its first spending.
  const fall = 1 - plan.equityShare * drawdown
  let balance = plan.retireYear === 0 ? plan.start * fall : plan.start
  let prices = 1
  if (track) track[0][run] = balance
  for (let year = 0; year < plan.years; year++) {
    // Fixed draw order every year: each pot, then inflation.
    let growth = 0
    for (let pot = 0; pot < plan.params.length; pot++) {
      growth += plan.weights[pot] * Math.exp(plan.params[pot].mu + plan.params[pot].sigma * normal())
    }
    const inflation = Math.max(-0.5, inputs.inflation + Math.max(0, inputs.inflationVolatility) * normal())
    if (year >= plan.retireYear) {
      balance -= spending * prices
      if (balance < 0) return year
    }
    balance *= growth
    prices *= 1 + inflation
    if (year < plan.retireYear) balance += savings * prices
    if (year + 1 === plan.retireYear) balance *= fall
    if (track) track[year + 1][run] = balance / prices
  }
  return -1
}

/** Linear-interpolated quantile of an ascending array. */
function quantile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0
  const position = (sorted.length - 1) * q
  const low = Math.floor(position)
  const high = Math.min(sorted.length - 1, low + 1)
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}

/** Percentile rows by age from year-major balances, each year sorted in place. */
function buildFan(track: readonly Float64Array[], failedYears: readonly number[], runs: number, currentAge: number): FanRow[] {
  return track.map((values, year): FanRow => {
    values.sort((a, b) => a - b)
    return {
      age: currentAge + year,
      p10: quantile(values, 0.1), p25: quantile(values, 0.25), p50: quantile(values, 0.5),
      p75: quantile(values, 0.75), p90: quantile(values, 0.9),
      depleted: failedYears.filter((failed) => failed < year).length / runs,
    }
  })
}

function failureAges(failedYears: readonly number[], currentAge: number): MonteCarloResult['failureAge'] {
  if (failedYears.length === 0) return null
  const ages = Float64Array.from(failedYears, (year) => currentAge + year).sort((a, b) => a - b)
  return { median: Math.round(quantile(ages, 0.5)), earlyTenth: Math.round(quantile(ages, 0.1)) }
}

export function runMonteCarlo(inputs: MonteCarloInputs): MonteCarloResult {
  const plan = buildPlan(inputs)
  const runs = Math.min(MAX_RUNS, Math.max(1, Math.round(inputs.runs)))
  const drawdown = Math.min(1, Math.max(0, inputs.equityDrawdown))
  // Year-major so each age's balances sort in place.
  const track = Array.from({ length: plan.years + 1 }, () => new Float64Array(runs))
  const failedYears: number[] = []
  for (let run = 0; run < runs; run++) {
    const failed = simulateRun(inputs, plan, run, drawdown, track)
    if (failed >= 0) failedYears.push(failed)
  }
  let baseFailures = 0
  if (drawdown > 0) {
    for (let run = 0; run < runs; run++) if (simulateRun(inputs, plan, run, 0) >= 0) baseFailures++
  }
  const currentAge = Math.round(inputs.currentAge)
  const fan = buildFan(track, failedYears, runs, currentAge)
  return {
    runs,
    successRate: 1 - failedYears.length / runs,
    medianEnding: fan[plan.years].p50,
    medianAtRetirement: fan[plan.retireYear].p50,
    failureAge: failureAges(failedYears, currentAge),
    successWithoutDrawdown: drawdown > 0 ? 1 - baseFailures / runs : null,
    fan,
  }
}

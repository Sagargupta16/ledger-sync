/**
 * XIRR -- extended internal rate of return for irregular cash flows.
 *
 * Use when cash-flow timing matters (not just amount). For a portfolio with
 * scattered SIP / lumpsum / withdrawal events, XIRR is the canonical
 * "annualized return" number.
 *
 * Newton-Raphson solver. Returns the rate as a PERCENT (e.g. 12.5 means
 * 12.5 % / year). Returns 0 when:
 *   - fewer than 2 cashflows
 *   - the solver diverges
 *   - derivative goes to ~0 before convergence (flat NPV curve)
 *
 * Convention: positive amount = cash INTO the investment (buy / SIP),
 * negative amount = cash OUT (withdrawal / current value treated as an
 * outflow on the end date). This matches Excel's XIRR.
 */

export interface CashFlow {
  date: Date
  /** Positive = money in, negative = money out. */
  amount: number
}

export function calculateXIRR(
  cashFlows: readonly CashFlow[],
  guess = 0.1,
  maxIterations = 100,
  tolerance = 1e-7,
): number {
  if (cashFlows.length < 2) return 0

  const daysBetween = (d1: Date, d2: Date) =>
    (d2.getTime() - d1.getTime()) / (365.25 * 24 * 60 * 60 * 1000)

  const firstDate = cashFlows[0].date
  let rate = guess

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0
    let dnpv = 0

    for (const cf of cashFlows) {
      const years = daysBetween(firstDate, cf.date)
      const factor = Math.pow(1 + rate, years)
      npv += cf.amount / factor
      if (years !== 0) {
        dnpv -= (years * cf.amount) / (factor * (1 + rate))
      }
    }

    if (Math.abs(dnpv) < 1e-12) break

    const newRate = rate - npv / dnpv
    if (Math.abs(newRate - rate) < tolerance) return newRate * 100
    rate = newRate

    // Guard against divergence into absurd territory
    if (rate < -0.99 || rate > 10) return 0
  }

  return rate * 100
}

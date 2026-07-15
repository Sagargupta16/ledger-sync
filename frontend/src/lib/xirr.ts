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

  const npvAt = (rate: number): number => {
    let npv = 0
    for (const f of flows) {
      npv += f.amount / Math.pow(1 + rate, f.years)
    }
    return npv
  }

  // ── Newton-Raphson (fast path) ──────────────────────────────────
  let rate = guess
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0
    let dnpv = 0
    for (const f of flows) {
      const factor = Math.pow(1 + rate, f.years)
      npv += f.amount / factor
      if (f.years !== 0) {
        dnpv -= (f.years * f.amount) / (factor * (1 + rate))
      }
    }

    if (Math.abs(dnpv) < 1e-12) break // flat curve -> bisection

    const newRate = rate - npv / dnpv
    if (Math.abs(newRate - rate) < tolerance) {
      // Converged inside the plausible bracket -> done.
      if (newRate > RATE_MIN && newRate < RATE_MAX) return newRate * 100
      break
    }
    rate = newRate

    if (rate <= RATE_MIN || rate >= RATE_MAX) break // left bracket -> bisection
  }

  // ── Bisection fallback (robust path) ────────────────────────────
  // Guaranteed to converge when NPV changes sign across the bracket. The
  // upper bound expands geometrically because short-horizon gains annualize
  // to astronomically large but real rates (2x in a month ≈ 409,000%/yr).
  let lo = RATE_MIN
  let hi = RATE_MAX
  let npvLo = npvAt(lo)
  let npvHi = npvAt(hi)
  if (!Number.isFinite(npvLo) || !Number.isFinite(npvHi)) return 0
  while (npvLo * npvHi > 0 && hi < 1e9) {
    hi *= 10
    npvHi = npvAt(hi)
    if (!Number.isFinite(npvHi)) return 0
  }
  if (npvLo * npvHi > 0) return 0 // no root anywhere: degenerate flows

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const npvMid = npvAt(mid)
    if (Math.abs(npvMid) < tolerance || (hi - lo) / 2 < tolerance) {
      return mid * 100
    }
    if (npvLo * npvMid < 0) {
      hi = mid
    } else {
      lo = mid
      npvLo = npvMid
    }
  }
  return ((lo + hi) / 2) * 100
}

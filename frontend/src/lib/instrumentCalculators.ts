/**
 * PPF / EPF / NPS Maturity Projection Calculators
 *
 * PPF: Annual compounding, max 1.5L/yr contribution, 15-year lock-in (extendable in 5-yr blocks).
 * EPF: Monthly compounding, employer + employee contributions.
 * NPS: Weighted return across equity/corporate bond/govt bond allocation.
 */

/**
 * Statutory EPF minimum: 12% of the ₹15,000 PF wage ceiling = ₹1,800/month.
 * Employees earning above the ceiling can still contribute on full salary,
 * but the legal floor is always computed on the capped wage.
 */
export const EPF_STATUTORY_RATE_PCT = 12
export const EPF_WAGE_CEILING = 15000
export const EPF_MIN_MONTHLY_CONTRIBUTION = (EPF_WAGE_CEILING * EPF_STATUTORY_RATE_PCT) / 100

/**
 * Of the employer's 12%, 8.33% of the EPS wage is diverted to the EPS pension
 * scheme (not the EPF corpus). The EPS wage is capped at the ₹15,000 ceiling,
 * so the diversion maxes out at 8.33% × 15,000 = ₹1,250/month.
 */
export const EPS_DIVERSION_RATE_PCT = 8.33

export interface EpfMonthlyContributions {
  /** Employee share — 12% statutory, more with VPF; all lands in EPF. */
  employee: number
  /** Employer share that actually reaches the EPF corpus (post EPS diversion). */
  employerEpf: number
  /** Portion of the employer's 12% diverted to EPS (does not earn EPF interest). */
  epsDiversion: number
  /** Total monthly inflow into the EPF corpus (employee + employerEpf). */
  total: number
}

/**
 * Monthly EPF-corpus contributions under the statutory model.
 *
 * Employee contributes `employeePct`% of basic (12% statutory, higher with VPF)
 * and all of it lands in EPF. The employer contributes a flat 12% of basic, but
 * 8.33% of the EPS wage (capped at the ₹15,000 ceiling = ₹1,250/mo) is diverted
 * to the EPS pension scheme, which does NOT earn EPF interest. So the employer's
 * EPF-corpus share is 12%·basic − 8.33%·min(basic, 15000) — exactly 3.67% only
 * at the ceiling, and larger above it. Passing a flat employer % (e.g. 3.67%, or
 * mirroring the employee's VPF %) is wrong for any salary off the ceiling.
 *
 * Assumes the employer contributes on the full basic (the common projection
 * assumption); employers who cap at the ₹15,000 wage contribute less.
 */
export function epfMonthlyContributions(
  monthlyBasic: number,
  employeePct: number = EPF_STATUTORY_RATE_PCT,
): EpfMonthlyContributions {
  const employee = (monthlyBasic * employeePct) / 100
  const employerTotal = (monthlyBasic * EPF_STATUTORY_RATE_PCT) / 100
  const epsDiversion = (EPS_DIVERSION_RATE_PCT / 100) * Math.min(monthlyBasic, EPF_WAGE_CEILING)
  const employerEpf = Math.max(0, employerTotal - epsDiversion)
  return { employee, employerEpf, epsDiversion, total: employee + employerEpf }
}

export interface YearProjection {
  year: number
  contributed: number
  returns: number
  total: number
}

export interface ProjectionResult {
  projectedValue: number
  totalContributed: number
  totalReturns: number
  yearByYear: YearProjection[]
}

/**
 * PPF projection with annual compounding.
 * Interest is credited at end of each financial year on lowest balance between
 * 5th of month and end of month. Simplified here as annual compound.
 *
 * @param currentBalance - existing PPF balance
 * @param annualContribution - yearly deposit (capped at 1,50,000)
 * @param years - projection period
 * @param rate - annual interest rate (default 7.1% as of FY 2025-26)
 */
export function projectPPF(
  currentBalance: number,
  annualContribution: number,
  years: number,
  rate = 7.1,
): ProjectionResult {
  const maxContribution = 150000
  const cappedContribution = Math.min(annualContribution, maxContribution)
  const r = rate / 100

  let balance = currentBalance
  let totalContributed = currentBalance
  const yearByYear: YearProjection[] = []

  for (let y = 1; y <= years; y++) {
    balance += cappedContribution
    totalContributed += cappedContribution
    balance *= 1 + r
    const totalReturns = balance - totalContributed
    yearByYear.push({
      year: y,
      contributed: Math.round(totalContributed),
      returns: Math.round(totalReturns),
      total: Math.round(balance),
    })
  }

  return {
    projectedValue: Math.round(balance),
    totalContributed: Math.round(totalContributed),
    totalReturns: Math.round(balance - totalContributed),
    yearByYear,
  }
}

/**
 * EPF projection with monthly compounding.
 *
 * The monthly inflow into the EPF corpus is the employee share (12% statutory,
 * higher with VPF) plus the employer's EPF share, which is 12% of basic minus
 * the EPS diversion (8.33% of the capped ₹15,000 wage). See
 * `epfMonthlyContributions` for the statutory model — passing a flat employer
 * percentage (e.g. mirroring the employee %) over-states the corpus because the
 * employer's 8.33% EPS slice does not earn EPF interest.
 *
 * Rate: 8.25% for FY 2024-25 / FY 2025-26 (set by EPFO yearly).
 *
 * @param monthlySalary - monthly basic salary
 * @param employeePct - employee contribution % (default 12, up to 20 with VPF)
 * @param rate - annual interest rate (default 8.25%)
 * @param years - projection period
 * @param currentBalance - existing EPF balance
 */
export function projectEPF(
  monthlySalary: number,
  employeePct = EPF_STATUTORY_RATE_PCT,
  rate = 8.25,
  years = 25,
  currentBalance = 0,
): ProjectionResult {
  const monthlyContribution = epfMonthlyContributions(monthlySalary, employeePct).total
  const monthlyRate = rate / 12 / 100

  let balance = currentBalance
  let totalContributed = currentBalance
  const yearByYear: YearProjection[] = []

  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      totalContributed += monthlyContribution
      balance = (balance + monthlyContribution) * (1 + monthlyRate)
    }
    yearByYear.push({
      year: y,
      contributed: Math.round(totalContributed),
      returns: Math.round(balance - totalContributed),
      total: Math.round(balance),
    })
  }

  return {
    projectedValue: Math.round(balance),
    totalContributed: Math.round(totalContributed),
    totalReturns: Math.round(balance - totalContributed),
    yearByYear,
  }
}

export interface NPSParams {
  monthlyContribution: number
  equityPct?: number
  corpBondPct?: number
  govtBondPct?: number
  equityReturn?: number
  corpReturn?: number
  govtReturn?: number
  years?: number
  currentBalance?: number
}

/**
 * NPS projection with weighted returns across asset classes.
 *
 * Default allocation: 50% equity (E), 30% corporate bonds (C), 20% govt bonds (G).
 * Historical returns (approx): E ~10-12%, C ~8-9%, G ~7-8%.
 */
export function projectNPS(params: NPSParams): ProjectionResult {
  const {
    monthlyContribution,
    equityPct = 50,
    corpBondPct = 30,
    govtBondPct = 20,
    equityReturn = 10,
    corpReturn = 8.5,
    govtReturn = 7.5,
    years = 25,
    currentBalance = 0,
  } = params
  // Weighted annual return
  const weightedReturn =
    (equityPct / 100) * equityReturn +
    (corpBondPct / 100) * corpReturn +
    (govtBondPct / 100) * govtReturn

  const monthlyRate = weightedReturn / 12 / 100

  let balance = currentBalance
  let totalContributed = currentBalance
  const yearByYear: YearProjection[] = []

  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      totalContributed += monthlyContribution
      balance = (balance + monthlyContribution) * (1 + monthlyRate)
    }
    yearByYear.push({
      year: y,
      contributed: Math.round(totalContributed),
      returns: Math.round(balance - totalContributed),
      total: Math.round(balance),
    })
  }

  return {
    projectedValue: Math.round(balance),
    totalContributed: Math.round(totalContributed),
    totalReturns: Math.round(balance - totalContributed),
    yearByYear,
  }
}

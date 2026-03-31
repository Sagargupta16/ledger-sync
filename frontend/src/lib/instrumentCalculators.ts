/**
 * PPF / EPF / NPS Maturity Projection Calculators
 *
 * PPF: Annual compounding, max 1.5L/yr contribution, 15-year lock-in (extendable in 5-yr blocks).
 * EPF: Monthly compounding, employer + employee contributions.
 * NPS: Weighted return across equity/corporate bond/govt bond allocation.
 */

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
 * Employee contributes 12% of basic salary, employer contributes 3.67% to EPF
 * (rest of employer 12% goes to EPS). Rate: 8.15% for FY 2023-24.
 *
 * @param monthlySalary - monthly basic salary
 * @param employeePct - employee contribution % (default 12)
 * @param employerPct - employer EPF contribution % (default 3.67)
 * @param rate - annual interest rate (default 8.15%)
 * @param years - projection period
 * @param currentBalance - existing EPF balance
 */
export function projectEPF(
  monthlySalary: number,
  employeePct = 12,
  employerPct = 3.67,
  rate = 8.15,
  years = 25,
  currentBalance = 0,
): ProjectionResult {
  const monthlyContribution = monthlySalary * (employeePct + employerPct) / 100
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

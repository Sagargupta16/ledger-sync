import {
  epfMonthlyContributions,
  minimumEpfContribution,
} from '@/lib/instrumentCalculators'
import type { ProjectionResult } from '@/lib/instrumentCalculators'
import type { AccountBalances } from '@/services/api/calculations'

export { computeNpsWeightedReturn as computeWeightedReturn } from '@/lib/instrumentCalculators'

export type Instrument = 'ppf' | 'epf' | 'nps'

export const TABS: { key: Instrument; label: string }[] = [
  { key: 'ppf', label: 'PPF' },
  { key: 'epf', label: 'EPF' },
  { key: 'nps', label: 'NPS' },
]

export function findAccountBalance(data: AccountBalances | undefined, pattern: string): number {
  if (!data?.accounts) return 0
  const key = Object.keys(data.accounts).find((k) => k.toLowerCase().includes(pattern))
  return key ? Math.max(0, data.accounts[key].balance) : 0
}

export function toChartData(data: ProjectionResult) {
  return data.yearByYear.map((y) => ({
    year: `Y${y.year}`,
    Contributed: y.contributed,
    Returns: y.returns,
  }))
}

export function computeEpfContribution(salary: number, contribPct: number) {
  // Employee contributes contribPct% of basic (all to EPF). The employer's EPF
  // share is 12% of basic minus the EPS diversion (8.33% of capped ₹15k wage),
  // so it is NOT simply the same % — total corpus inflow is employee + employerEpf,
  // not 2× the employee share.
  const { employee: yourShare, employerEpf, total: totalMonthly } =
    epfMonthlyContributions(salary, contribPct)
  const minContrib = minimumEpfContribution(salary)
  return { yourShare, employerEpf, totalMonthly, minContrib }
}

// Keep allocation summing to 100
export function rebalanceNpsAllocation(equityValue: number, corp: number, govt: number) {
  const remaining = 100 - equityValue
  const ratio = corp + govt > 0 ? corp / (corp + govt) : 0.5
  const nextCorp = Math.round(remaining * ratio)
  return { equity: equityValue, corp: nextCorp, govt: remaining - nextCorp }
}

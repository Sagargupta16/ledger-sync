/**
 * The maths behind the canvas's `calculate` tool, in code so a projection chart
 * never rests on the model's arithmetic. Yearly rows, whole rupees. SIP growth
 * reuses the app's own projection (lib/finance/sipProjection.ts), so the canvas
 * and the Projections page agree.
 */

import { projectMonthlySIP } from '@/lib/finance/sipProjection'

export interface YearRow {
  readonly year: number
  readonly [field: string]: number
}

export interface Calculation {
  readonly kind: string
  readonly rows: readonly YearRow[]
  readonly summary: Readonly<Record<string, number>>
  readonly assumptions: string
}

const round = (value: number) => Math.round(value)

export function sip(monthly: number, ratePct: number, years: number, stepUpPct = 0, corpus = 0): Calculation {
  const { months, summary } = projectMonthlySIP({
    monthlySIP: monthly,
    annualRate: ratePct,
    years,
    sipGrowthRate: stepUpPct,
    startingCorpus: corpus,
    initialInvested: corpus,
  })
  const rows = months
    .filter((month) => month.month % 12 === 0)
    .map((month) => ({ year: month.month / 12, invested: round(month.invested), value: round(month.value) }))
  const stepUp = stepUpPct ? `, ${stepUpPct}% yearly step-up` : ''
  return {
    kind: 'sip',
    rows,
    summary: { invested: round(summary.invested), value: round(summary.value), gain: round(summary.returns) },
    assumptions: `${ratePct}% a year compounded monthly, contribution at the start of each month${stepUp}`,
  }
}

export function lumpsum(amount: number, ratePct: number, years: number, monthly = false): Calculation {
  const rows: YearRow[] = []
  for (let year = 1; year <= years; year++) {
    const factor = monthly ? (1 + ratePct / 1200) ** (12 * year) : (1 + ratePct / 100) ** year
    rows.push({ year, invested: round(amount), value: round(amount * factor) })
  }
  const value = rows.at(-1)?.value ?? round(amount)
  return {
    kind: 'lumpsum',
    rows,
    summary: { invested: round(amount), value, gain: value - round(amount) },
    assumptions: `${ratePct}% a year compounded ${monthly ? 'monthly' : 'yearly'}`,
  }
}

export function loan(principal: number, ratePct: number, years: number): Calculation {
  const months = years * 12
  const monthlyRate = ratePct / 1200
  const emi = monthlyRate === 0 ? principal / months : (principal * monthlyRate) / (1 - (1 + monthlyRate) ** -months)
  let balance = principal
  const rows: YearRow[] = []
  let interestTotal = 0
  for (let year = 1; year <= years; year++) {
    let interest = 0
    let paid = 0
    for (let month = 0; month < 12; month++) {
      const charge = balance * monthlyRate
      const toPrincipal = Math.min(emi - charge, balance)
      interest += charge
      paid += toPrincipal
      balance -= toPrincipal
    }
    interestTotal += interest
    rows.push({ year, principal_paid: round(paid), interest_paid: round(interest), balance: round(Math.max(balance, 0)) })
  }
  return {
    kind: 'loan',
    rows,
    summary: { emi: round(emi), total_interest: round(interestTotal), total_paid: round(emi * months) },
    assumptions: `${ratePct}% a year, ${months} equal monthly instalments (reducing balance)`,
  }
}

export function inflation(amount: number, ratePct: number, years: number): Calculation {
  const rows: YearRow[] = []
  for (let year = 1; year <= years; year++) {
    const factor = (1 + ratePct / 100) ** year
    rows.push({ year, future_cost: round(amount * factor), todays_value_of_amount: round(amount / factor) })
  }
  return {
    kind: 'inflation',
    rows,
    summary: { future_cost: rows.at(-1)?.future_cost ?? round(amount) },
    assumptions: `${ratePct}% inflation a year`,
  }
}

export function goal(target: number, ratePct: number, years: number): Calculation {
  const months = years * 12
  const monthlyRate = ratePct / 1200
  const growth = monthlyRate === 0 ? months : (((1 + monthlyRate) ** months - 1) / monthlyRate) * (1 + monthlyRate)
  const monthly = target / growth
  const path = sip(monthly, ratePct, years)
  return {
    kind: 'goal',
    rows: path.rows,
    summary: { monthly_sip: round(monthly), target: round(target), invested: path.summary.invested },
    assumptions: `${path.assumptions}; monthly amount that reaches the target`,
  }
}

export function cagr(start: number, end: number, years: number): Calculation {
  const rate = ((end / start) ** (1 / years) - 1) * 100
  const rows: YearRow[] = []
  for (let year = 1; year <= years; year++) rows.push({ year, value: round(start * (1 + rate / 100) ** year) })
  return {
    kind: 'cagr',
    rows,
    summary: { cagr_pct: Math.round(rate * 100) / 100 },
    assumptions: 'constant yearly growth between the two values',
  }
}

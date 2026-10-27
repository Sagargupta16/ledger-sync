/**
 * The advance-tax plan for a year: ledger payments matched to the four dates in
 * ./advanceTaxRules.ts, deferment interest at each date, and default interest
 * from ./advanceTaxInterest.ts once the year is over. A computation aid, not
 * tax advice.
 */
import { inclusiveDaySpan } from '@/lib/dateUtils'

import {
  ADVANCE_TAX_THRESHOLD,
  DEFAULT_INTEREST_PAID_PCT,
  INSTALMENT_RULES,
  advanceTaxDueDates,
  type AdvanceTaxDueDate,
  type InstalmentRule,
} from './advanceTaxRules'
import { defaultInterestOf, interestOn, toPaise, toRupees, type DefaultInterest } from './advanceTaxInterest'
import type { TaxPayment } from './taxPayments'

/** Whole days from `today` to `date` (both `YYYY-MM-DD`): 0 is today, negative is past. */
export function daysFromToday(today: string, date: string): number {
  return date < today ? 1 - inclusiveDaySpan(date, today) : inclusiveDaySpan(today, date) - 1
}

/** `paid` covers the date; `safe-harbour` is short but interest-free; `open` is not due yet. */
export type InstalmentStatus = 'paid' | 'safe-harbour' | 'short' | 'open'

export interface AdvanceTaxInstalment extends AdvanceTaxDueDate {
  requiredCumulative: number
  paidInWindow: number
  rowsInWindow: number
  paidCumulative: number
  /** Unpaid part of `requiredCumulative` at this date. */
  gap: number
  /** 12 in June, 36 in September, else null; `safeHarbourAmount` is that share in INR. */
  safeHarbourPct: number | null
  safeHarbourAmount: number | null
  safeHarbourMet: boolean
  /** Deferment interest; only charged once the date has passed. */
  interest: number
  isPast: boolean
  status: InstalmentStatus
}

export interface AdvanceTaxPlanInput {
  taxYearStart: number
  /** Income tax for the year, with surcharge and cess, before TDS and TCS. */
  projectedTax: number
  tdsTcs: number
  /** Advance-tax rows; only those inside the tax year count. */
  payments: readonly TaxPayment[]
  /** Self-assessment rows; only those after the year end and up to today count. */
  selfAssessment?: readonly TaxPayment[]
  /** Ledger today, `YYYY-MM-DD`. */
  today: string
}

export interface AdvanceTaxPlan {
  netLiability: number
  applies: boolean
  instalments: AdvanceTaxInstalment[]
  /** Paid 16-31 March: advance tax for the year, but after the last instalment. */
  paidAfterLastDate: number
  totalPaid: number
  rowCount: number
  deferralInterest: number
  /** Self-assessment tax recorded after the year end. */
  selfAssessmentPaid: number
  /** Default interest once the year is over; null while it runs or when 90% was paid. */
  defaultInterest: DefaultInterest | null
  next: AdvanceTaxInstalment | null
}

/** Whole paise, so payments that add up exactly to a threshold never come out a float residue short. */
const paiseOf = (payments: readonly TaxPayment[]): number =>
  payments.reduce((sum, payment) => sum + toPaise(payment.amount), 0)

const runningTotals = (values: readonly number[]): number[] =>
  values.reduce<number[]>((totals, value) => [...totals, (totals.at(-1) ?? 0) + value], [])

function statusOf(gapPaise: number, isPast: boolean, safeHarbourMet: boolean): InstalmentStatus {
  if (gapPaise <= 0) return 'paid'
  if (!isPast) return 'open'
  return safeHarbourMet ? 'safe-harbour' : 'short'
}

/** Payments counted at each date: after the previous date, up to and including this one. */
function windowsOf(payments: readonly TaxPayment[], dueDates: readonly AdvanceTaxDueDate[]): TaxPayment[][] {
  return dueDates.map((due, index) => {
    const after = index === 0 ? '' : dueDates[index - 1].date
    return payments.filter((payment) => payment.date > after && payment.date <= due.date)
  })
}

interface InstalmentContext {
  netLiability: number
  applies: boolean
  today: string
}

function instalmentOf(
  due: AdvanceTaxDueDate,
  rule: InstalmentRule,
  inWindow: readonly TaxPayment[],
  paidPaise: number,
  { netLiability, applies, today }: InstalmentContext,
): AdvanceTaxInstalment {
  const requiredCumulative = Math.round((netLiability * rule.cumulativePct) / 100)
  const gapPaise = Math.max(0, toPaise(requiredCumulative) - paidPaise)
  // In paise, whole-rupee liability times the percentage is the share exactly.
  const safeHarbourMet = rule.safeHarbourPct !== null && paidPaise >= netLiability * rule.safeHarbourPct
  const isPast = today > due.date
  return {
    ...due,
    requiredCumulative,
    paidInWindow: toRupees(paiseOf(inWindow)),
    rowsInWindow: inWindow.length,
    paidCumulative: toRupees(paidPaise),
    gap: toRupees(gapPaise),
    safeHarbourPct: rule.safeHarbourPct,
    safeHarbourAmount: rule.safeHarbourPct === null ? null : Math.round((netLiability * rule.safeHarbourPct) / 100),
    safeHarbourMet,
    interest: applies && isPast && !safeHarbourMet ? interestOn(gapPaise, rule.interestMonths) : 0,
    isPast,
    status: statusOf(gapPaise, isPast, safeHarbourMet),
  }
}

export function buildAdvanceTaxPlan(input: Readonly<AdvanceTaxPlanInput>): AdvanceTaxPlan {
  const netLiability = Math.max(0, Math.round(input.projectedTax - input.tdsTcs))
  const applies = netLiability >= ADVANCE_TAX_THRESHOLD
  const yearStart = `${input.taxYearStart}-04-01`
  const yearEnd = `${input.taxYearStart + 1}-03-31`
  const payments = input.payments.filter((payment) => payment.date >= yearStart && payment.date <= yearEnd)
  const dueDates = advanceTaxDueDates(input.taxYearStart)
  const windows = windowsOf(payments, dueDates)
  const cumulative = runningTotals(windows.map(paiseOf))
  const context = { netLiability, applies, today: input.today }
  const instalments = dueDates.map((due, index) =>
    instalmentOf(due, INSTALMENT_RULES[index], windows[index], cumulative[index], context))

  const lastDate = dueDates[dueDates.length - 1].date
  const afterLastPaise = paiseOf(payments.filter((payment) => payment.date > lastDate))
  const totalPaise = cumulative[cumulative.length - 1] + afterLastPaise
  const selfAssessment = (input.selfAssessment ?? [])
    .filter((payment) => payment.date > yearEnd && payment.date <= input.today)
  const charged = applies && input.today > yearEnd && totalPaise < netLiability * DEFAULT_INTEREST_PAID_PCT

  return {
    netLiability,
    applies,
    instalments,
    paidAfterLastDate: toRupees(afterLastPaise),
    totalPaid: toRupees(totalPaise),
    rowCount: payments.length,
    deferralInterest: instalments.reduce((sum, instalment) => sum + instalment.interest, 0),
    selfAssessmentPaid: toRupees(paiseOf(selfAssessment)),
    defaultInterest: charged
      ? defaultInterestOf({
        taxYearStart: input.taxYearStart,
        shortfallPaise: toPaise(netLiability) - totalPaise,
        selfAssessment,
        today: input.today,
      })
      : null,
    next: instalments.find((instalment) => !instalment.isPast) ?? null,
  }
}

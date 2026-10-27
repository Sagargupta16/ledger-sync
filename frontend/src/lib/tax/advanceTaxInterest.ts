/**
 * Interest on advance tax under Rule 119A: 1% a month, the principal floored to
 * a multiple of INR 100 and a part month counted as a full month. Callers sum
 * payments in whole paise so a 12%, 36% or 90% test is never missed by a float
 * residue. Ported from community/itr-agent (MIT, same author)
 * src/engine/interest.ts `floor100` and `interest234B`, including its s.234B(2)
 * self-assessment segments. A computation aid, not tax advice.
 */
import { MONTHS_PER_YEAR } from '@/lib/dateUtils'

const PAISE_PER_RUPEE = 100
const RATE_PER_MONTH = 0.01
const INTEREST_PRINCIPAL_STEP = 100
const APRIL = 4

/** Month 4 after the year, 31 July: the return due date with no business income and no audit. */
const RETURN_DUE_MONTH = 4
/**
 * Month 12, 31 March after the year: the end of its assessment year and of the
 * 12-month revision window (see filingDeadlines.ts). Past it the planner no
 * longer assumes a balance is still unpaid today.
 */
const LAST_OPEN_MONTH = 12

export const toPaise = (rupees: number): number => Math.round(rupees * PAISE_PER_RUPEE)

export const toRupees = (paise: number): number => paise / PAISE_PER_RUPEE

/** Whole-rupee interest for `months` months on a principal in paise, floored to INR 100 first. */
export function interestOn(principalPaise: number, months: number): number {
  const steps = Math.floor(Math.max(0, principalPaise) / (PAISE_PER_RUPEE * INTEREST_PRINCIPAL_STEP))
  return Math.round(steps * INTEREST_PRINCIPAL_STEP * RATE_PER_MONTH * Math.max(0, months))
}

/** Months from 1 April after the tax year to `date` (`YYYY-MM-DD`), part month in full: April is 1, July 4. */
export const monthsAfterYear = (taxYearStart: number, date: string): number =>
  (Number(date.slice(0, 4)) - taxYearStart - 1) * MONTHS_PER_YEAR + Number(date.slice(5, 7)) - APRIL + 1

/**
 * Where the default-interest clock stops: at a self-assessment payment that
 * cleared the balance; with the return by 31 July while that is still ahead;
 * today once 31 July has passed; and back at 31 July once the assessment year
 * is over, when the ledger cannot say when the balance was paid.
 */
export type DefaultInterestClock = 'self-assessment' | 'return-due' | 'today' | 'closed'

export interface DefaultInterest {
  /** Whole rupees. */
  amount: number
  /** Months charged from 1 April after the year, part month in full. */
  months: number
  clock: DefaultInterestClock
  /** The self-assessment payment the clock stopped at, `YYYY-MM-DD`. */
  stoppedOn: string | null
}

interface DefaultInterestInput {
  taxYearStart: number
  /** Advance tax short of the year's tax after TDS and TCS, in paise. */
  shortfallPaise: number
  /** Self-assessment payments made after the year end, up to today. */
  selfAssessment: readonly { date: string; amount: number }[]
  /** Ledger today, `YYYY-MM-DD`. */
  today: string
}

function clockFor(elapsed: number, cursor: number): { clock: DefaultInterestClock; end: number } {
  if (elapsed <= RETURN_DUE_MONTH) return { clock: 'return-due', end: RETURN_DUE_MONTH }
  if (elapsed <= LAST_OPEN_MONTH) return { clock: 'today', end: elapsed }
  // A closed year whose last self-assessment payment came after July ends there.
  return cursor > RETURN_DUE_MONTH
    ? { clock: 'self-assessment', end: cursor }
    : { clock: 'closed', end: RETURN_DUE_MONTH }
}

/**
 * Default interest (1961 Act s.234B): 1% a month from 1 April after the year on
 * the advance tax short of the year's tax. The month of a self-assessment
 * payment is charged on the amount before it, and later months on what is left
 * (s.234B(2)).
 */
export function defaultInterestOf(input: Readonly<DefaultInterestInput>): DefaultInterest {
  const payments = [...input.selfAssessment].sort((a, b) => a.date.localeCompare(b.date))
  let outstanding = input.shortfallPaise
  let cursor = 0
  let amount = 0
  for (const payment of payments) {
    const month = monthsAfterYear(input.taxYearStart, payment.date)
    amount += interestOn(outstanding, month - cursor)
    cursor = month
    outstanding -= toPaise(payment.amount)
    if (outstanding <= 0) return { amount, months: cursor, clock: 'self-assessment', stoppedOn: payment.date }
  }
  const { clock, end } = clockFor(monthsAfterYear(input.taxYearStart, input.today), cursor)
  return {
    amount: amount + interestOn(outstanding, end - cursor),
    months: end,
    clock,
    stoppedOn: clock === 'self-assessment' ? (payments.at(-1)?.date ?? null) : null,
  }
}

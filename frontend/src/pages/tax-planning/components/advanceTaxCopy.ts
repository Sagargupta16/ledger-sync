import { formatCurrency, formatDate } from '@/lib/formatters'
import type { AdvanceTaxPlan } from '@/lib/tax/advanceTax'
import type { AdvanceTaxLaw } from '@/lib/tax/advanceTaxRules'
import type { DefaultInterest } from '@/lib/tax/advanceTaxInterest'

/** Paid in full by now: covered only when every date was met on time. */
function paidInFullVerdict(plan: AdvanceTaxPlan): string {
  if (plan.instalments.every((instalment) => instalment.status === 'paid')) return 'All four instalments are covered.'
  return plan.deferralInterest > 0
    ? "The year's advance tax is paid in full, but not all of it by the due dates, so interest applies to the dates marked Short."
    : "The year's advance tax is paid in full; the dates paid short carry no interest on this estimate."
}

function yearEndVerdict(balance: number, selfAssessmentPaid: number): string {
  const unpaid = `${formatCurrency(balance)} was unpaid at the year end`
  if (selfAssessmentPaid <= 0) return `${unpaid}; it is due as self-assessment tax before you file.`
  const left = balance - selfAssessmentPaid
  return left > 0
    ? `${unpaid}; ${formatCurrency(selfAssessmentPaid)} has been paid as self-assessment tax, leaving ${formatCurrency(left)}.`
    : `${unpaid} and was paid afterwards as self-assessment tax.`
}

/** The one-line status above the instalments. */
export function advanceTaxVerdict(plan: AdvanceTaxPlan, yearLabel: string, yearEnded: boolean): string {
  if (!plan.applies) {
    return plan.totalPaid > 0
      ? `On this estimate ${yearLabel} needs no advance tax; the ${formatCurrency(plan.totalPaid)} paid counts toward the year's tax when you file.`
      : `No advance tax is due for ${yearLabel}: what TDS and TCS leave unpaid is under INR 10,000.`
  }
  const { next } = plan
  if (next) {
    return next.gap > 0
      ? `Next: pay ${formatCurrency(next.gap)} by ${formatDate(next.date)} to reach ${next.cumulativePct}% (${formatCurrency(next.requiredCumulative)}).`
      : `Payments so far cover the ${formatDate(next.date)} instalment.`
  }
  const balance = Math.max(0, plan.netLiability - plan.totalPaid)
  if (balance === 0) return paidInFullVerdict(plan)
  return yearEnded
    ? yearEndVerdict(balance, plan.selfAssessmentPaid)
    : `All four dates have passed with ${formatCurrency(balance)} unpaid; a payment by 31 March still counts as advance tax.`
}

/** Where the default-interest months run to. */
function defaultInterestSpan({ clock, months, stoppedOn }: DefaultInterest): string {
  const span = `${months} ${months === 1 ? 'month' : 'months'} at 1%`
  switch (clock) {
    case 'self-assessment':
      return `to the self-assessment payment${stoppedOn ? ` of ${formatDate(stoppedOn)}` : ''}, ${span}`
    case 'return-due':
      return `if the balance is paid with the return by 31 July, ${span}`
    case 'today':
      return `if the balance is paid today, ${span}`
    case 'closed':
      return `if the balance was paid with the return by 31 July, ${span}; each later month added 1%`
  }
}

/** Deferment interest per instalment, plus default interest once the year is over. */
export function advanceTaxInterestSummary(plan: AdvanceTaxPlan, law: AdvanceTaxLaw): string {
  const parts: string[] = []
  if (plan.deferralInterest > 0) {
    parts.push(`${formatCurrency(plan.deferralInterest)} for instalments paid short (${law.defermentSection})`)
  }
  const late = plan.defaultInterest
  if (late && late.amount > 0) {
    parts.push(`${formatCurrency(late.amount)} (${law.defaultSection}) ${defaultInterestSpan(late)}`)
  }
  return parts.length === 0 ? 'No interest on this estimate so far.' : `Interest estimate: ${parts.join(', plus ')}.`
}

import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'

/**
 * Indian advance tax deadlines (Sections 234B / 234C).
 *
 * Salaried people with only TDS income don't need to file advance tax, but
 * ANY meaningful non-salary income (capital gains, dividends, freelance,
 * rental, RSU sales, interest > ₹10k) past ₹10k liability triggers it.
 * Missing the instalments leads to 1 %/month penalty interest -- small per
 * month but annoying at year-end.
 *
 * Percentages are cumulative, not per-quarter:
 *   Jun 15  -> 15 % of annual tax paid
 *   Sep 15  -> 45 % total
 *   Dec 15  -> 75 % total
 *   Mar 15  -> 100 % total
 */
interface AdvanceTaxInstalment {
  readonly deadlineMonth: number
  readonly deadlineDay: number
  readonly cumulativePercent: number
  readonly label: string
}

const SCHEDULE: readonly AdvanceTaxInstalment[] = [
  { deadlineMonth: 6, deadlineDay: 15, cumulativePercent: 15, label: 'Q1' },
  { deadlineMonth: 9, deadlineDay: 15, cumulativePercent: 45, label: 'Q2' },
  { deadlineMonth: 12, deadlineDay: 15, cumulativePercent: 75, label: 'Q3' },
  { deadlineMonth: 3, deadlineDay: 15, cumulativePercent: 100, label: 'Q4' },
]

/** Order the schedule by actual calendar dates within the FY (Apr-Mar). */
function orderedForFY(fyStartYear: number): Array<AdvanceTaxInstalment & { dueDate: Date }> {
  return SCHEDULE.map((inst) => ({
    ...inst,
    dueDate: new Date(
      // Jun/Sep/Dec fall in `fyStartYear`; Mar falls in `fyStartYear + 1`.
      inst.deadlineMonth === 3 ? fyStartYear + 1 : fyStartYear,
      inst.deadlineMonth - 1,
      inst.deadlineDay,
    ),
  }))
}

interface Props {
  readonly annualTax: number
  readonly fyStartYear: number
  readonly isCurrentFY: boolean
}

/**
 * Shows the four advance-tax deadlines for the selected FY with cumulative
 * amounts due and status badges (paid deadline / due soon / upcoming).
 *
 * This component does NOT know what you've actually paid; it's a reminder of
 * what SHOULD be paid by each date given your projected liability. We mark
 * past deadlines as "Passed" since (as of today) they can't be acted on --
 * useful context so users know they may owe 234B/234C interest.
 */
export default function AdvanceTaxSchedule({ annualTax, fyStartYear, isCurrentFY }: Props) {
  // Skip the section entirely if no tax liability -- clutter, no value.
  if (annualTax <= 0) return null

  const today = new Date()
  const deadlines = orderedForFY(fyStartYear)

  return (
    <div className="rounded-2xl border border-border bg-white/[0.02] p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-app-orange/10">
          <AlertTriangle className="w-4 h-4 text-app-orange" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">Advance Tax Schedule</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Non-salary income (capital gains, freelance, dividends &gt;&nbsp;&#8377;10k)
            triggers advance tax. Missing deadlines = 1&nbsp;%/month penalty under 234B/234C.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {deadlines.map((inst) => {
          const cumulativeDue = (annualTax * inst.cumulativePercent) / 100
          const isPast = inst.dueDate < today
          const daysUntil = Math.ceil((inst.dueDate.getTime() - today.getTime()) / 86_400_000)
          const isDueSoon = isCurrentFY && !isPast && daysUntil <= 30
          const label = inst.dueDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })

          let statusBadge
          if (isPast) {
            statusBadge = (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3 h-3" aria-hidden />
                Passed
              </span>
            )
          } else if (isDueSoon) {
            statusBadge = (
              <span className="inline-flex items-center gap-1 text-xs text-app-yellow font-semibold">
                <AlertTriangle className="w-3 h-3" aria-hidden />
                {daysUntil}d to go
              </span>
            )
          } else {
            statusBadge = (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Circle className="w-3 h-3" aria-hidden />
                Upcoming
              </span>
            )
          }

          return (
            <div
              key={inst.label}
              className={`p-3 rounded-xl border ${isDueSoon ? 'border-app-yellow/40 bg-app-yellow/5' : 'border-border bg-white/[0.02]'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-white">{inst.label}</span>
                {statusBadge}
              </div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {inst.cumulativePercent}% cumulative
              </p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {formatCurrency(cumulativeDue)}
              </p>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Amounts are cumulative — e.g. by 15 Sep you should have paid 45 % of the year's total tax
        across Q1 + Q2 combined. Amounts shown assume your projected liability of{' '}
        <span className="font-semibold text-foreground">{formatCurrency(annualTax)}</span> for this FY.
      </p>
    </div>
  )
}

import ProgressBar from '@/components/shared/ProgressBar'
import { Money } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { daysFromToday, type AdvanceTaxInstalment, type AdvanceTaxPlan } from '@/lib/tax/advanceTax'
import { colors } from '@/constants/colors'

const DUE_SOON_DAYS = 30

const STATUS_STYLE = {
  paid: { text: 'Covered', chip: 'bg-app-green/15 text-app-green', bar: colors.app.green },
  'safe-harbour': { text: 'Safe harbour met', chip: 'bg-app-teal/15 text-app-teal', bar: colors.app.teal },
  short: { text: 'Short', chip: 'bg-app-red/15 text-app-red', bar: colors.app.red },
} as const

function openChip(days: number): { text: string; chip: string } {
  if (days === 0) return { text: 'Due today', chip: 'bg-app-orange/15 text-app-orange' }
  const text = `Due in ${days} ${days === 1 ? 'day' : 'days'}`
  return days <= DUE_SOON_DAYS
    ? { text, chip: 'bg-app-orange/15 text-app-orange' }
    : { text, chip: 'bg-[var(--overlay-3)] text-muted-foreground' }
}

interface RowProps {
  instalment: AdvanceTaxInstalment
  today: string
  deferralSection: string
}

function InstalmentRow({ instalment, today, deferralSection }: Readonly<RowProps>) {
  const style = instalment.status === 'open'
    ? { ...openChip(daysFromToday(today, instalment.date)), bar: colors.app.blue }
    : STATUS_STYLE[instalment.status]
  const dateLabel = formatDate(instalment.date)
  const rows = instalment.rowsInWindow

  return (
    <li className="rounded-lg border border-[var(--hairline-1)] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{dateLabel}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {instalment.cumulativePct}% of the year&apos;s advance tax, cumulative
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style.chip}`}>{style.text}</span>
      </div>

      {/* Two-up below sm: short figures there so an 8-digit amount never collides with its neighbour. */}
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Due by this date</dt>
          <dd className="mt-0.5 text-sm"><Money value={instalment.requiredCumulative} compactBelowSm /></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Paid by this date</dt>
          <dd className="mt-0.5 text-sm"><Money value={instalment.paidCumulative} compactBelowSm /></dd>
          {rows > 0 && (
            <dd className="text-xs leading-5 text-muted-foreground">
              {formatCurrency(instalment.paidInWindow)} in {rows} {rows === 1 ? 'payment' : 'payments'} this period
            </dd>
          )}
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{instalment.isPast ? 'Shortfall' : 'Still to pay'}</dt>
          <dd className="mt-0.5 text-sm"><Money value={instalment.gap} compactBelowSm /></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Interest, {deferralSection}</dt>
          <dd className="mt-0.5 text-sm">
            {instalment.isPast
              ? <Money value={instalment.interest} compactBelowSm />
              : <span className="text-muted-foreground">Not due yet</span>}
          </dd>
        </div>
      </dl>

      <ProgressBar
        className="mt-3"
        value={instalment.paidCumulative}
        max={instalment.requiredCumulative}
        target={instalment.safeHarbourAmount ?? undefined}
        color={style.bar}
        ariaLabel={`Paid ${formatCurrency(instalment.paidCumulative)} of ${formatCurrency(instalment.requiredCumulative)} due by ${dateLabel}`}
      />
      {instalment.safeHarbourAmount !== null && (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          The tick is the safe harbour: paying {formatCurrency(instalment.safeHarbourAmount)}
          {' '}({instalment.safeHarbourPct}%) by this date means no interest on this instalment.
        </p>
      )}
    </li>
  )
}

interface Props {
  plan: AdvanceTaxPlan
  today: string
  deferralSection: string
}

/** The four dated instalments with what was paid against each, oldest first. */
export default function AdvanceTaxInstalments({ plan, today, deferralSection }: Readonly<Props>) {
  return (
    <>
      <ol className="mt-4 space-y-3" aria-label="Advance tax instalments">
        {plan.instalments.map((instalment) => (
          <InstalmentRow
            key={instalment.date}
            instalment={instalment}
            today={today}
            deferralSection={deferralSection}
          />
        ))}
      </ol>
      {plan.paidAfterLastDate > 0 && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Paid from 16 to 31 March: <Money value={plan.paidAfterLastDate} />. It is advance tax for the year
          and counts toward the 90% test, but it is after the last instalment date.
        </p>
      )}
    </>
  )
}

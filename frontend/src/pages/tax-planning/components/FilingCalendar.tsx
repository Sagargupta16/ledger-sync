import { useId, useMemo } from 'react'
import { motion } from 'motion/react'

import { getTodayKey } from '@/lib/dateUtils'
import { formatDate } from '@/lib/formatters'
import { daysFromToday } from '@/lib/tax/advanceTax'
import { filingDeadlines, hasBusinessIncome, type FilingDeadline } from '@/lib/tax/filingDeadlines'
import { isAct2025Year } from '@/lib/tax-config'
import { FY_START_MONTH } from '@/lib/taxCalculator'
import { selectRsuGrants, usePreferencesStore } from '@/store/preferencesStore'
import { fadeUpItem } from '@/constants/animations'

import type { TaxPlanningModel } from '../useTaxPlanning'

const SOON_DAYS = 30

function statusOf(days: number): { text: string; chip: string } {
  if (days < 0) return { text: 'Closed', chip: 'bg-[var(--overlay-3)] text-muted-foreground' }
  if (days === 0) return { text: 'Today', chip: 'bg-app-orange/15 text-app-orange' }
  const text = `${days} ${days === 1 ? 'day' : 'days'} left`
  return { text, chip: days <= SOON_DAYS ? 'bg-app-orange/15 text-app-orange' : 'bg-app-blue/15 text-app-blue' }
}

/**
 * The return duty for a foreign-asset holder. Tax Year 2026-27 on: 2025 Act
 * s.263(1)(a)(ix) (owner PDF, Wayback snapshot 2026-06-12). AY 2026-27: the
 * foreign-asset proviso to 1961 Act s.139(1) (inserted by Finance Act 2012; its
 * ordinal was not re-read, so the copy does not cite one), with ITR-2 Schedule
 * FA on a calendar-year basis per the AY 2026-27 offline utility v1.4
 * (https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-08/ITR2_AY_26-27_V1.4.zip).
 * Unvested RSUs are left out: no source read settles whether they are reported.
 */
function foreignAssetNote(taxYearStart: number): string {
  const lead = 'RSU grants are on file. Vested shares of a company listed outside India are a foreign asset:'
  return isAct2025Year(taxYearStart)
    ? `${lead} a resident (not NOR) must file a return even at zero tax (s.263(1)(a)(ix)) and report them in Schedule FA.`
    : `${lead} a resident (not NOR) must file a return even with no tax due (the foreign-asset proviso to s.139(1))`
      + ` and list them in ITR-2 Schedule FA, which covers January to December ${taxYearStart}.`
}

function DeadlineRow({ deadline, today }: Readonly<{ deadline: FilingDeadline; today: string }>) {
  const status = statusOf(daysFromToday(today, deadline.date))
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--hairline-1)] p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{deadline.label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{deadline.note}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 sm:flex-col sm:items-end">
        <time dateTime={deadline.date} className="text-sm font-semibold tabular-nums text-foreground">
          {formatDate(deadline.date)}
        </time>
        <span className="text-xs text-muted-foreground">{deadline.basis}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.chip}`}>{status.text}</span>
      </div>
    </li>
  )
}

interface Props {
  planning: TaxPlanningModel
}

/** Return, belated and revised deadlines for the selected tax year. */
export default function FilingCalendar({ planning }: Readonly<Props>) {
  const headingId = useId()
  const rsuGrants = usePreferencesStore(selectRsuGrants)
  const incomeGroups = planning.currentFYData?.incomeGroups
  // Only rows the page taxes: business income classified as non-taxable is not in the estimate either.
  const businessIncome = useMemo(
    () => hasBusinessIncome(Object.values(incomeGroups ?? {}).flatMap((group) => group.transactions)),
    [incomeGroups],
  )
  // Statutory dates follow the April to March tax year; the advance-tax panel explains the gate.
  if (planning.fiscalYearStartMonth !== FY_START_MONTH) return null

  const calendar = filingDeadlines(planning.fyYear, businessIncome)
  const today = getTodayKey()

  return (
    <motion.section variants={fadeUpItem} aria-labelledby={headingId} className="ledger-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">Filing calendar</h2>
        {calendar && <span className="text-xs text-muted-foreground">{calendar.yearLabel}</span>}
      </div>
      {calendar ? (
        <>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Return dates for {calendar.scope}, under the {calendar.act}.
            Statutory dates, which CBDT can extend. A computation aid, not tax advice.
          </p>
          <ol className="mt-4 space-y-2" aria-label={`Filing deadlines, ${calendar.yearLabel}`}>
            {calendar.deadlines.map((deadline) => (
              <DeadlineRow key={deadline.key} deadline={deadline} today={today} />
            ))}
          </ol>
          {calendar.caveat && (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{calendar.caveat}</p>
          )}
          {rsuGrants.length > 0 && (
            <p className="mt-3 rounded-lg border border-app-orange/30 bg-app-orange/10 px-3 py-2.5 text-xs leading-5 text-foreground">
              {foreignAssetNote(planning.fyYear)}
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          The filing calendar covers AY 2026-27 (FY 2025-26) onward.
        </p>
      )}
    </motion.section>
  )
}

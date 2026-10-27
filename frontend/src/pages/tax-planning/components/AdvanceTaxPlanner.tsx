import { useId, useMemo, useState } from 'react'

import { Button, Input, Money } from '@/components/ui'
import { useDebounce } from '@/hooks/useDebounce'
import { formatFYLabel, getTodayKey } from '@/lib/dateUtils'
import { numberFormat } from '@/lib/intlCache'
import { buildAdvanceTaxPlan } from '@/lib/tax/advanceTax'
import { FIRST_ADVANCE_TAX_YEAR, advanceTaxLaw } from '@/lib/tax/advanceTaxRules'
import { advanceTaxPayments, selfAssessmentPayments } from '@/lib/tax/taxPayments'
import { formatTaxYearLabel } from '@/lib/tax-config'
import { FY_START_MONTH } from '@/lib/taxCalculator'

import type { TaxPlanningModel } from '../useTaxPlanning'
import AdvanceTaxInstalments from './AdvanceTaxInstalments'
import AdvanceTaxNotes from './AdvanceTaxNotes'
import { advanceTaxInterestSummary, advanceTaxVerdict } from './advanceTaxCopy'
import { advanceTaxEstimate } from './advanceTaxInputs'

/** The plan, and the live verdict with it, follow the TDS field once typing pauses this long. */
const TDS_SETTLE_MS = 400

/** Whole rupees whatever the display currency: the field takes the INR total from Form 26AS or AIS. */
const formatInrWhole = (value: number): string =>
  numberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .format(value)

/** A typed TDS figure: null for a blank field (use the estimate), undefined when malformed or negative. */
function parseTds(draft: string | null): number | null | undefined {
  const text = draft?.trim() ?? ''
  if (text === '') return null
  const value = Number(text)
  // NaN fails `>= 0` too.
  return value >= 0 ? value : undefined
}

interface Props {
  planning: TaxPlanningModel
}

function Figure({ label, value, hint }: Readonly<{ label: string; value: number; hint: string }>) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg"><Money value={value} bold compactBelowSm /></dd>
      <dd className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</dd>
    </div>
  )
}

/**
 * Advance tax for the selected year: the page's tax minus TDS and TCS, split
 * into the four dated instalments once it reaches INR 10,000, with ledger
 * payments matched to each date and interest estimated on any shortfall.
 */
export default function AdvanceTaxPlanner({ planning }: Readonly<Props>) {
  const headingId = useId()
  const inputId = useId()
  const helpId = useId()
  const [tdsDraft, setTdsDraft] = useState<string | null>(null)
  const settledDraft = useDebounce(tdsDraft, TDS_SETTLE_MS)
  const fy = planning.fyYear
  const payments = useMemo(
    () => advanceTaxPayments(planning.currentFYData?.transactions ?? []),
    [planning.currentFYData],
  )
  // A year's balance is paid as self-assessment tax during the year after it.
  const nextYearRows = planning.transactionsByFY[formatFYLabel(fy + 1)]?.transactions
  const selfAssessment = useMemo(() => selfAssessmentPayments(nextYearRows ?? []), [nextYearRows])
  const heading = <h2 id={headingId} className="text-base font-semibold">Advance tax</h2>

  if (planning.fiscalYearStartMonth !== FY_START_MONTH || fy < FIRST_ADVANCE_TAX_YEAR) {
    return (
      <section aria-labelledby={headingId} className="ledger-panel p-4 sm:p-5">
        {heading}
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {planning.fiscalYearStartMonth === FY_START_MONTH
            ? 'Advance tax planning starts at FY 2020-21, the first year these tax rules cover.'
            : 'Advance tax follows the April to March tax year. Set the fiscal year to start in April in Settings to plan instalments here.'}
        </p>
      </section>
    )
  }

  const today = getTodayKey()
  const estimate = advanceTaxEstimate(planning)
  // The error follows each keystroke; the plan follows the settled figure, and a malformed one uses the estimate.
  const draftInvalid = parseTds(tdsDraft) === undefined
  const settledTds = parseTds(settledDraft)
  const tdsTcs = settledTds ?? estimate.salaryTds
  const plan = buildAdvanceTaxPlan({
    taxYearStart: fy, projectedTax: estimate.projectedTax, tdsTcs, payments, selfAssessment, today,
  })
  const yearEnded = today > `${fy + 1}-03-31`
  const law = advanceTaxLaw(fy)
  const rowsLabel = `${plan.rowCount} ledger ${plan.rowCount === 1 ? 'row' : 'rows'} named Advance Tax`

  return (
    <section aria-labelledby={headingId} className="ledger-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {heading}
        <span className="text-xs text-muted-foreground">{law.act}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Tax that TDS and TCS do not cover is paid in four dated instalments once it reaches INR 10,000.
        A computation aid built from the estimate above, not tax advice.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure
          label="Income tax for the year"
          value={estimate.projectedTax}
          hint={planning.useSalaryProjection ? 'Full-year forecast, with surcharge and cess' : 'On recorded income, with surcharge and cess'}
        />
        <Figure label="TDS and TCS" value={tdsTcs} hint={typeof settledTds === 'number' ? 'Your figure' : 'Estimate: tax on salary alone'} />
        <Figure
          label="Advance tax for the year"
          value={plan.netLiability}
          hint={plan.applies ? 'INR 10,000 or more, so instalments apply' : 'Under INR 10,000, so not required'}
        />
        <Figure label="Paid as advance tax" value={plan.totalPaid} hint={rowsLabel} />
      </dl>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-xs">
          <Input
            id={inputId}
            label="TDS and TCS for the year (INR)"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={tdsDraft ?? String(Math.round(estimate.salaryTds))}
            onChange={(event) => setTdsDraft(event.target.value)}
            error={draftInvalid ? 'Enter an amount of zero or more.' : undefined}
            // Replaces the Input's own error-only description, so the error id is kept here.
            aria-describedby={draftInvalid ? `${inputId}-error ${helpId}` : helpId}
          />
        </div>
        {tdsDraft !== null && (
          <Button variant="outline" size="sm" onClick={() => setTdsDraft(null)}>
            Use the estimate ({formatInrWhole(estimate.salaryTds)})
          </Button>
        )}
      </div>
      <p id={helpId} className="mt-2 text-xs leading-5 text-muted-foreground">
        Replace the estimate with the total from Form 26AS or AIS, in rupees: salary TDS, TDS on interest or rent,
        and TCS on foreign remittances. A blank field uses the estimate.
      </p>

      <p className="mt-4 rounded-lg bg-[var(--overlay-2)] px-3 py-2.5 text-sm font-medium text-foreground" aria-live="polite">
        {advanceTaxVerdict(plan, formatTaxYearLabel(fy), yearEnded)}
      </p>

      {plan.applies && (
        <>
          <AdvanceTaxInstalments plan={plan} today={today} deferralSection={law.defermentSection} />
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {advanceTaxInterestSummary(plan, law)} Interest uses the current estimate; the final figure uses the tax
            on the income you return.
          </p>
        </>
      )}

      <AdvanceTaxNotes
        showsDefaultInterest={plan.defaultInterest !== null}
        partialYear={planning.isCurrentFY && !planning.useSalaryProjection}
      />
    </section>
  )
}

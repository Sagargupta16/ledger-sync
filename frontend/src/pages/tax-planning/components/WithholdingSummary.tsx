import { Link } from 'react-router'

import { Money } from '@/components/ui'
import { ROUTES } from '@/constants'
import { useTaxAisSummary } from '@/hooks/api/useTaxAis'
import { formatDate } from '@/lib/formatters'
import { taxYearKey } from '@/lib/tax-config/taxYear'
import type { TaxPaidTillDate } from '@/lib/tdsScheduleCalculator'

interface Props {
  estimate: TaxPaidTillDate
  salaryMonths: number
  /** The page's fiscal year ("FY 2025-26"). When given, that year's imported AIS totals replace the "--". */
  fiscalYear?: string
  /** Month the fiscal year starts (Settings; default 4). An AIS covers April to March, so any other start month shows no AIS figure. */
  fiscalYearStartMonth?: number
}

const APRIL_FY_RE = /^\s*FY\s*(\d{4})\s*-\s*\d{2,4}\s*$/i

/** "2025-26", the April-March year an AIS covers; null for a label or start month that is not that year. */
function aisTaxYear(fiscalYear: string, fiscalYearStartMonth: number): string | null {
  const match = fiscalYearStartMonth === 4 ? APRIL_FY_RE.exec(fiscalYear) : null
  return match ? taxYearKey(Number(match[1])) : null
}

const linkClass = 'font-medium text-app-blue underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]'

const noteClass = 'mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground'

const RSU_NOTE = 'Missing RSU actuals use a 31.2% withholding estimate (30% tax plus 4% cess on the tax). Missing vesting prices use a single matching share receipt on the vest date where available, otherwise the configured share price.'

/** The year's imported AIS TDS against the combined estimate, or the link to import it. */
function AisActualTds({ taxYear, estimatedTds }: Readonly<{ taxYear: string; estimatedTds: number }>) {
  const ais = useTaxAisSummary(taxYear).data ?? null
  if (!ais) {
    return (
      <p>
        Actual payroll TDS: <span aria-label="Actual payroll TDS not recorded">--</span>.
        {' '}<Link to={ROUTES.AIS_IMPORT} className={linkClass}>Import your AIS</Link> to record it, or
        confirm against payslips or Form 26AS.
      </p>
    )
  }
  const gap = estimatedTds - ais.tds_salary
  return (
    <p>
      Actual payroll TDS from your AIS: <Money value={ais.tds_salary} bold />; other TDS{' '}
      <Money value={ais.tds_other} />.
      {' '}{Math.abs(gap) < 1
        ? 'The combined estimate matches it.'
        : <>The combined estimate is <Money value={Math.abs(gap)} /> {gap > 0 ? 'above' : 'below'} it.</>}
      {' '}Read from the AIS on {formatDate(new Date(ais.updated_at))} as a computation aid;{' '}
      <Link to={ROUTES.AIS_IMPORT} className={linkClass}>import again</Link> after the AIS changes.
    </p>
  )
}

export default function WithholdingSummary({
  estimate, salaryMonths, fiscalYear, fiscalYearStartMonth = 4,
}: Readonly<Props>) {
  const unmatchedRsu = estimate.unmatchedRsuNetReceipts ?? 0
  const aisYear = fiscalYear ? aisTaxYear(fiscalYear, fiscalYearStartMonth) : null
  return (
    <section aria-label="Withholding to date" className="ledger-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Withholding to date</h2>
        <span className="text-xs text-muted-foreground">{salaryMonths} recorded salary months</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Payroll uses estimated full-year earnings. RSU withholding is counted on vesting.
        These amounts are separate from the tax liability calculated above.
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Cash payroll withholding · estimate</dt>
          <dd className="mt-1 text-lg"><Money value={estimate.cashTaxPaid} bold /></dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">RSU share withholding</dt>
          <dd className="mt-1 text-lg"><Money value={estimate.rsuWithholding} bold /></dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            <Money value={estimate.rsuRecordedWithholding} /> recorded;
            {' '}<Money value={estimate.rsuEstimatedWithholding} /> estimated
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Combined withholding · estimate</dt>
          <dd className="mt-1 text-lg text-app-blue"><Money value={estimate.taxPaid} bold /></dd>
        </div>
      </dl>
      {unmatchedRsu > 0.01 && (
        <p className="mt-4 text-xs leading-5 text-app-orange">
          Incomplete RSU estimate: <Money value={unmatchedRsu} /> of recorded share receipts
          exceeds the configured vesting values. The estimate covers configured vests only.
          Reconcile vesting entries and prices in Salary Settings; all ledger receipts remain in
          the income calculation.
        </p>
      )}
      {aisYear ? (
        <div className={`${noteClass} space-y-1`}>
          <AisActualTds taxYear={aisYear} estimatedTds={estimate.taxPaid} />
          <p>{RSU_NOTE}</p>
        </div>
      ) : (
        <p className={noteClass}>
          Actual payroll TDS: <span aria-label="Actual payroll TDS not recorded">--</span>.
          {' '}Confirm against payslips or Form 26AS. {RSU_NOTE}
        </p>
      )}
    </section>
  )
}

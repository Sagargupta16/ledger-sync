import { Money } from '@/components/ui'
import type { TaxPaidTillDate } from '@/lib/tdsScheduleCalculator'

interface Props {
  estimate: TaxPaidTillDate
  salaryMonths: number
}

export default function WithholdingSummary({ estimate, salaryMonths }: Readonly<Props>) {
  const unmatchedRsu = estimate.unmatchedRsuNetReceipts ?? 0
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
      <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        Actual payroll TDS: <span aria-label="Actual payroll TDS not recorded">--</span>.
        {' '}Confirm against payslips or Form 26AS. Missing RSU actuals use a 31.2% withholding
        estimate (30% tax plus 4% cess on the tax). Missing vesting prices use a single matching
        share receipt on the vest date where available, otherwise the configured share price.
      </p>
    </section>
  )
}

import { Money } from '@/components/ui'
import { getTaxConfig } from '@/lib/tax-config'

import type { TaxPlanningModel } from '../useTaxPlanning'

interface Props {
  planning: TaxPlanningModel
}

export default function TaxEstimateBasis({ planning }: Readonly<Props>) {
  const rules = getTaxConfig(planning.fyYear)
  let incomeBasis = 'Gross taxable income recorded in your ledger'
  if (planning.useSalaryProjection) {
    incomeBasis = 'Employment forecast plus other recorded taxable income'
  } else if (planning.taxComputation.incomeBasis === 'net') {
    incomeBasis = 'Net employment receipts converted to estimated gross'
  }

  return (
    <section
      aria-label="Tax estimate assumptions"
      className="space-y-3 border-b border-[var(--hairline-1)] pb-5"
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <dt className="text-xs text-muted-foreground">Income basis</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{incomeBasis}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Standard deduction</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <Money value={planning.standardDeduction} bold />
            <span className="text-xs text-muted-foreground">
              {planning.isNewRegime ? 'New regime' : 'Old regime'}
            </span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Tax rules used</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{rules.fyLabel}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">{rules.source}</dd>
        </div>
      </dl>
      {planning.taxComputation.incomeBasis === 'net' && !planning.useSalaryProjection && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Withholding is estimated on employment income only. Other taxable income stays at its recorded gross amount.
          Known employee deductions are restored before estimating gross salary.
          These estimates do not establish how much tax was paid.
        </p>
      )}
      {rules.fyStartYear !== planning.fyYear && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Rules for {planning.effectiveFY} are not available here yet. This estimate uses{' '}
          {rules.fyLabel}; check the applicable rules before filing.
        </p>
      )}
    </section>
  )
}

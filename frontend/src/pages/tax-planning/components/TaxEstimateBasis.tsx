import { Money } from '@/components/ui'
import {
  formatSectionRef,
  formatTaxYearLabel,
  getTaxConfig,
  isAct2025Year,
  sectionTooltip,
} from '@/lib/tax-config'

import type { TaxPlanningModel } from '../useTaxPlanning'

interface Props {
  planning: TaxPlanningModel
}

export default function TaxEstimateBasis({ planning }: Readonly<Props>) {
  const rules = getTaxConfig(planning.fyYear)
  let incomeBasis = 'Gross taxable income recorded in your ledger'
  if (planning.useSalaryProjection) {
    incomeBasis = 'Employment forecast plus other recorded taxable income'
  } else if (planning.taxComputation.withholdingAssumption === 'annual_payroll') {
    incomeBasis = 'Recorded employment gross estimated from annual payroll and vested shares'
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
          <dt className="text-xs text-muted-foreground" title={sectionTooltip('16(ia)', planning.fyYear)}>
            Standard deduction
          </dt>
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
          Employment receipts are restored to estimated gross, including known employee deductions.
          Other taxable income stays at its recorded gross amount.
          This view calculates liability on income received; the withholding estimate is shown separately.
        </p>
      )}
      {isAct2025Year(planning.fyYear) && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          The Income-tax Act 2025 replaces the 1961 Act from Tax Year 2026-27 with new section
          numbers, such as {formatSectionRef('115BAC', planning.fyYear)} for the new regime and{' '}
          {formatSectionRef('80C', planning.fyYear)}. Tax Year 2026-27 keeps the FY 2025-26 slabs,
          standard deduction and rebate.
        </p>
      )}
      {rules.fyStartYear !== planning.fyYear && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Rules for {formatTaxYearLabel(planning.fyYear)} are not available here yet. This estimate uses{' '}
          {rules.fyLabel}; check the applicable rules before filing.
        </p>
      )}
    </section>
  )
}

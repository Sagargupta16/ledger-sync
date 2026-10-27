import { useId, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button, Money } from '@/components/ui'
import { compareTaxRegimes } from '@/lib/finance/taxPlanning'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { deductionLabel, OLD_REGIME_DEDUCTIONS, sectionTooltip } from '@/lib/tax-config'

import DeductionInput from './DeductionInput'
import DeductionSaveBar from './DeductionSaveBar'
import { useDeductionDraft } from './useDeductionDraft'

interface Props {
  grossIncome: number
  fyYear: number
  salaryMonthsCount: number
  hasEmploymentIncome?: boolean
  employmentIncome?: number
}

type Comparison = NonNullable<ReturnType<typeof compareTaxRegimes>>

function BreakEvenDetail({ comparison }: Readonly<{ comparison: Comparison }>) {
  if (!comparison.newIsBetter) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Claim only deductions you qualify for when filing your return.
      </p>
    )
  }
  if (comparison.breakEvenDeduction === null) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Old Regime still costs more with up to {formatCurrency(comparison.breakEvenLimit)} in
        additional deductions. This comparison limit is not a statutory deduction cap.
      </p>
    )
  }
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      Old Regime matches or beats this estimate at{' '}
      <span className="font-semibold text-foreground">
        {formatCurrency(comparison.breakEvenDeduction)}
      </span>{' '}
      in total deductions.
      {comparison.totalDeductions > 0 && (
        <span>
          {' '}That is {formatCurrency(comparison.additionalDeductionToBreakEven ?? 0)} more
          than the deductions entered above.
        </span>
      )}
    </p>
  )
}

function ComparisonVerdict({ comparison }: Readonly<{ comparison: Comparison }>) {
  if (comparison.equalTax) {
    return (
      <p className="text-sm text-muted-foreground">
        Both regimes give the same estimated tax with these inputs.
      </p>
    )
  }
  return (
    <>
      <p className="text-sm">
        <span className="font-semibold text-foreground">
          {comparison.newIsBetter ? 'New Regime' : 'Old Regime'}
        </span>
        {' saves you '}
        <Money value={comparison.difference} bold className="text-app-green" />
        {comparison.newIsBetter && comparison.totalDeductions === 0
          ? ' without additional deductions.'
          : '.'}
      </p>
      <BreakEvenDetail comparison={comparison} />
    </>
  )
}

export default function RegimeComparison({
  grossIncome,
  fyYear,
  salaryMonthsCount,
  hasEmploymentIncome = salaryMonthsCount > 0,
  employmentIncome,
}: Readonly<Props>) {
  const deductionFieldsId = useId()
  // Saved per tax year, so the amounts survive a visit; edits apply at once.
  const deductions = useDeductionDraft(fyYear)
  const [showDeductions, setShowDeductions] = useState(false)

  const comparison = compareTaxRegimes({
    grossIncome,
    fyYear,
    salaryMonthsCount,
    hasEmploymentIncome,
    employmentIncome,
    oldRegimeDeductions: deductions.total,
  })
  if (!comparison) return null
  const { newTax, oldTax, newIsBetter, oldIsBetter, totalDeductions } = comparison

  return (
    <div className="space-y-4">
      <div className="grid border-y border-border sm:grid-cols-2">
        <div
          className={`border-b p-4 sm:border-b-0 sm:border-r ${
            newIsBetter
              ? 'border-app-green/30 bg-app-green/5'
              : 'border-border bg-[var(--overlay-1)]'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">New Regime</span>
            {newIsBetter && (
              <span className="text-caption font-semibold text-app-green px-2 py-0.5 rounded-full bg-app-green/20">
                Better
              </span>
            )}
          </div>
          <Money value={newTax.totalTax} bold className="text-xl" />
          <p className="text-xs text-muted-foreground mt-1">
            Effective rate: {formatPercent(comparison.newEffectiveRate)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Standard deduction: {formatCurrency(newTax.standardDeduction)}
          </p>
        </div>
        <div
          className={`p-4 ${
            oldIsBetter ? 'bg-app-green/5' : 'bg-[var(--overlay-1)]'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Old Regime</span>
            {oldIsBetter && (
              <span className="text-caption font-semibold text-app-green px-2 py-0.5 rounded-full bg-app-green/20">
                Better
              </span>
            )}
          </div>
          <Money value={oldTax.totalTax} bold className="text-xl" />
          <p className="text-xs text-muted-foreground mt-1">
            Effective rate: {formatPercent(comparison.oldEffectiveRate)}
            {totalDeductions > 0 && (
              <span className="text-app-green">
                {' '}
                (with {formatCurrency(totalDeductions)} deductions)
              </span>
            )}
            {totalDeductions === 0 && (
              <span className="text-muted-foreground"> (without deductions)</span>
            )}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Standard deduction: {formatCurrency(oldTax.standardDeduction)}
          </p>
        </div>
      </div>

      <div className="border-y border-border py-3">
        <Button
          type="button"
          onClick={() => setShowDeductions(!showDeductions)}
          variant="ghost"
          size="sm"
          icon={
            showDeductions ? (
              <ChevronLeft className="w-4 h-4 rotate-[-90deg]" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )
          }
          aria-expanded={showDeductions}
          aria-controls={deductionFieldsId}
          className="w-full justify-start whitespace-normal px-0 text-left"
        >
          Enter your deductions to compare accurately
          {totalDeductions > 0 && (
            <span className="ml-2 text-xs font-semibold text-app-green">
              Total: {formatCurrency(totalDeductions)}
            </span>
          )}
        </Button>

        {showDeductions && (
          <div id={deductionFieldsId} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              {OLD_REGIME_DEDUCTIONS.map((field) => (
                <DeductionInput
                  key={field.key}
                  id={`${deductionFieldsId}-${field.key.replaceAll(/[^A-Za-z0-9]/g, '')}`}
                  label={deductionLabel(field, fyYear)}
                  sublabel={field.hint}
                  title={sectionTooltip(field.key, fyYear)}
                  value={deductions.values[field.key]}
                  max={field.max}
                  showHeadroom={field.headroom}
                  disabled={deductions.isLoading}
                  onChange={(amount) => deductions.setValue(field.key, amount)}
                />
              ))}
            </div>
            <DeductionSaveBar draft={deductions} fyStartYear={fyYear} />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-[var(--overlay-2)] px-4 py-3" aria-live="polite">
        <ComparisonVerdict comparison={comparison} />
      </div>
    </div>
  )
}

import { useId, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button, Money } from '@/components/ui'
import { compareTaxRegimes } from '@/lib/finance/taxPlanning'
import { formatCurrency } from '@/lib/formatters'

import DeductionInput from './DeductionInput'

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
  const [sec80C, setSec80C] = useState(0)
  const [sec80CCD1B, setSec80CCD1B] = useState(0)
  const [sec80D, setSec80D] = useState(0)
  const [hra, setHra] = useState(0)
  const [sec24b, setSec24b] = useState(0)
  const [showDeductions, setShowDeductions] = useState(false)

  // 80CCD(1B) is a standalone ₹50k additional deduction for NPS Tier-1 contributions,
  // over and above the 80C 1.5L cap. Many salaried users miss it.
  const comparison = compareTaxRegimes({
    grossIncome,
    fyYear,
    salaryMonthsCount,
    hasEmploymentIncome,
    employmentIncome,
    oldRegimeDeductions: sec80C + sec80CCD1B + sec80D + hra + sec24b,
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
            Effective rate: {comparison.newEffectiveRate.toFixed(1)}%
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
            Effective rate: {comparison.oldEffectiveRate.toFixed(1)}%
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
          <div id={deductionFieldsId} className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <DeductionInput
              label="Sec 80C"
              sublabel="PPF, ELSS, LIC (max 1.5L)"
              value={sec80C}
              max={150000}
              onChange={setSec80C}
            />
            <DeductionInput
              label="Sec 80CCD(1B)"
              sublabel="Extra NPS (max 50K, over 80C)"
              value={sec80CCD1B}
              max={50000}
              onChange={setSec80CCD1B}
            />
            <DeductionInput
              label="Sec 80D"
              sublabel="Health Insurance (max 75K)"
              value={sec80D}
              max={75000}
              onChange={setSec80D}
            />
            <DeductionInput
              label="HRA"
              sublabel="House Rent Allowance"
              value={hra}
              max={500000}
              onChange={setHra}
            />
            <DeductionInput
              label="Sec 24(b)"
              sublabel="Home Loan Interest (max 2L)"
              value={sec24b}
              max={200000}
              onChange={setSec24b}
            />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-[var(--overlay-2)] px-4 py-3" aria-live="polite">
        <ComparisonVerdict comparison={comparison} />
      </div>
    </div>
  )
}

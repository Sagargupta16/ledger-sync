import { useId, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button, Money } from '@/components/ui'
import { calculateTax, getStandardDeduction, getTaxSlabs } from '@/lib/taxCalculator'
import { formatCurrency } from '@/lib/formatters'

import { calculateBreakEvenDeduction } from '../taxPlanningUtils'
import DeductionInput from './DeductionInput'
import RegimeVerdictDetail from './RegimeVerdictDetail'

interface Props {
  grossIncome: number
  fyYear: number
  salaryMonthsCount: number
}

export default function RegimeComparison({
  grossIncome,
  fyYear,
  salaryMonthsCount,
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
  const totalDeductions = sec80C + sec80CCD1B + sec80D + hra + sec24b
  const newStandardDeduction = getStandardDeduction(fyYear, 'new')
  const oldStandardDeduction = getStandardDeduction(fyYear, 'old')

  const newTax = calculateTax(
    grossIncome,
    getTaxSlabs(fyYear, 'new'),
    newStandardDeduction,
    true,
    salaryMonthsCount,
    true,
    fyYear,
  )
  const oldRegimeIncome = Math.max(0, grossIncome - totalDeductions)
  const oldTax = calculateTax(
    oldRegimeIncome,
    getTaxSlabs(fyYear, 'old'),
    oldStandardDeduction,
    true,
    salaryMonthsCount,
    false,
    fyYear,
  )

  const newTotal = newTax.totalTax
  const oldTotal = oldTax.totalTax
  const diff = Math.abs(newTotal - oldTotal)
  const equalTax = Math.round(newTotal * 100) === Math.round(oldTotal * 100)
  const newIsBetter = !equalTax && newTotal < oldTotal
  const oldIsBetter = !equalTax && oldTotal < newTotal
  const betterRegime = newIsBetter ? 'New Regime' : 'Old Regime'

  const breakEvenDeduction =
    newIsBetter && grossIncome > 0
      ? calculateBreakEvenDeduction(
          grossIncome,
          fyYear,
          salaryMonthsCount,
          newTotal,
        )
      : 0

  if (grossIncome <= 0) return null

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
          <Money value={newTotal} bold className="text-xl" />
          <p className="text-xs text-muted-foreground mt-1">
            Effective rate: {grossIncome > 0 ? ((newTotal / grossIncome) * 100).toFixed(1) : '0'}%
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Standard deduction: {formatCurrency(newStandardDeduction)}
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
          <Money value={oldTotal} bold className="text-xl" />
          <p className="text-xs text-muted-foreground mt-1">
            Effective rate: {grossIncome > 0 ? ((oldTotal / grossIncome) * 100).toFixed(1) : '0'}%
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
            Standard deduction: {formatCurrency(oldStandardDeduction)}
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
        {equalTax ? (
          <p className="text-sm text-muted-foreground">
            Both regimes give the same estimated tax with these inputs.
          </p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-semibold text-foreground">{betterRegime}</span>
              {' saves you '}
              <Money value={diff} bold className="text-app-green" />
              {newIsBetter && totalDeductions === 0 ? ' without additional deductions.' : '.'}
            </p>
            <RegimeVerdictDetail
              newIsBetter={newIsBetter}
              totalDeductions={totalDeductions}
              breakEvenDeduction={breakEvenDeduction}
              grossIncome={grossIncome}
            />
          </>
        )}
      </div>
    </div>
  )
}

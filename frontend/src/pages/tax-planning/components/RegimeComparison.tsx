import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { calculateTax, getTaxSlabs } from '@/lib/taxCalculator'
import { formatCurrency } from '@/lib/formatters'
import { calculateBreakEvenDeduction } from '../taxPlanningUtils'
import DeductionInput from './DeductionInput'
import RegimeVerdictDetail from './RegimeVerdictDetail'

interface Props {
  grossIncome: number
  fyYear: number
  standardDeduction: number
  salaryMonthsCount: number
}

export default function RegimeComparison({
  grossIncome,
  fyYear,
  standardDeduction,
  salaryMonthsCount,
}: Readonly<Props>) {
  const [sec80C, setSec80C] = useState(0)
  const [sec80CCD1B, setSec80CCD1B] = useState(0)
  const [sec80D, setSec80D] = useState(0)
  const [hra, setHra] = useState(0)
  const [sec24b, setSec24b] = useState(0)
  const [showDeductions, setShowDeductions] = useState(false)

  // 80CCD(1B) is a standalone ₹50k additional deduction for NPS Tier-1 contributions,
  // over and above the 80C 1.5L cap. Many salaried users miss it.
  const totalDeductions = sec80C + sec80CCD1B + sec80D + hra + sec24b

  const newTax = calculateTax(
    grossIncome,
    getTaxSlabs(fyYear, 'new'),
    standardDeduction,
    true,
    salaryMonthsCount,
    true,
    fyYear,
  )
  const oldRegimeIncome = Math.max(0, grossIncome - totalDeductions)
  const oldTax = calculateTax(
    oldRegimeIncome,
    getTaxSlabs(fyYear, 'old'),
    standardDeduction,
    true,
    salaryMonthsCount,
    false,
    fyYear,
  )

  const newTotal = newTax.totalTax
  const oldTotal = oldTax.totalTax
  const diff = Math.abs(newTotal - oldTotal)
  const newIsBetter = newTotal <= oldTotal
  const oldIsBetter = !newIsBetter
  const betterRegime = newIsBetter ? 'New Regime' : 'Old Regime'

  const breakEvenDeduction =
    newIsBetter && grossIncome > 0
      ? calculateBreakEvenDeduction(
          grossIncome,
          fyYear,
          standardDeduction,
          salaryMonthsCount,
          newTotal,
        )
      : 0

  if (grossIncome <= 0) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          className={`p-4 rounded-xl border ${newIsBetter ? 'border-app-green/30 bg-app-green/5' : 'border-border bg-white/5'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">New Regime</span>
            {newIsBetter && (
              <span className="text-caption font-semibold text-app-green px-2 py-0.5 rounded-full bg-app-green/20">
                Better
              </span>
            )}
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(newTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Effective rate: {grossIncome > 0 ? ((newTotal / grossIncome) * 100).toFixed(1) : '0'}%
          </p>
        </div>
        <div
          className={`p-4 rounded-xl border ${oldIsBetter ? 'border-app-green/30 bg-app-green/5' : 'border-border bg-white/5'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Old Regime</span>
            {oldIsBetter && (
              <span className="text-caption font-semibold text-app-green px-2 py-0.5 rounded-full bg-app-green/20">
                Better
              </span>
            )}
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(oldTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Effective rate: {grossIncome > 0 ? ((oldTotal / grossIncome) * 100).toFixed(1) : '0'}%
            {totalDeductions > 0 && (
              <span className="text-app-green">
                {' '}
                (with {formatCurrency(totalDeductions)} deductions)
              </span>
            )}
            {totalDeductions === 0 && (
              <span className="text-text-quaternary"> (without deductions)</span>
            )}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white/[0.02] p-4">
        <button
          type="button"
          onClick={() => setShowDeductions(!showDeductions)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-white transition-colors w-full"
        >
          {showDeductions ? (
            <ChevronLeft className="w-4 h-4 rotate-[-90deg]" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          Enter your deductions to compare accurately
          {totalDeductions > 0 && (
            <span className="ml-auto text-xs text-app-green font-semibold">
              Total: {formatCurrency(totalDeductions)}
            </span>
          )}
        </button>

        {showDeductions && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
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

      <div className="p-4 rounded-xl bg-app-purple/5 border border-app-purple/20">
        <p className="text-sm">
          <span className="font-semibold text-app-purple">{betterRegime}</span>
          {' saves you '}
          <span className="font-semibold text-app-green">{formatCurrency(diff)}</span>
          {' more'}
          {newIsBetter && totalDeductions === 0 ? ' (without any deductions).' : '.'}
        </p>

        <RegimeVerdictDetail
          newIsBetter={newIsBetter}
          totalDeductions={totalDeductions}
          breakEvenDeduction={breakEvenDeduction}
          grossIncome={grossIncome}
        />
      </div>
    </div>
  )
}

import { BarChart3 } from 'lucide-react'

import { formatCurrency } from '@/lib/formatters'

interface ReturnsAnalysisSectionProps {
  currentValueInput: number
  currentBalance: number
  onCurrentValueChange: (value: number) => void
  overrideGainsPercent: number
  overrideGains: number
  totalHistoricalInvested: number
  xirrPercent: number
  investmentDurationYears: number
  effectiveCurrentValue: number
  currentValueLabel: string
  effectiveValueLabel: string
  totalReturnColorClass: string
  totalReturnSignPrefix: string
  xirrColorClass: string
  xirrSignPrefix: string
}

export function ReturnsAnalysisSection(props: Readonly<ReturnsAnalysisSectionProps>) {
  const {
    currentValueInput,
    currentBalance,
    onCurrentValueChange,
    overrideGainsPercent,
    overrideGains,
    totalHistoricalInvested,
    xirrPercent,
    investmentDurationYears,
    effectiveCurrentValue,
    currentValueLabel,
    effectiveValueLabel,
    totalReturnColorClass,
    totalReturnSignPrefix,
    xirrColorClass,
    xirrSignPrefix,
  } = props

  return (
    <div className="mt-8 pt-6 border-t border-border">
      <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-app-orange" />
        Returns Analysis
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <label
            htmlFor="current-value"
            className="block text-sm font-medium text-muted-foreground mb-2"
          >
            Current Value ({'₹'})
          </label>
          <input
            id="current-value"
            type="number"
            inputMode="decimal"
            value={currentValueInput || ''}
            placeholder={formatCurrency(currentBalance).replace('₹', '').trim()}
            onChange={(e) => onCurrentValueChange(Number(e.target.value))}
            className="w-full bg-white/5 border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-app-blue/50 focus:border-app-blue/30 transition-colors"
            min="0"
            step="1000"
          />
          <p className="text-xs text-muted-foreground mt-1">{currentValueLabel}</p>
        </div>

        <div className="flex flex-col justify-center">
          <p className="text-sm text-muted-foreground">Total Return</p>
          <p className={`text-2xl font-bold ${totalReturnColorClass}`}>
            {totalReturnSignPrefix}
            {overrideGainsPercent.toFixed(2)}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatCurrency(overrideGains)} on {formatCurrency(totalHistoricalInvested)}
          </p>
        </div>

        <div className="flex flex-col justify-center">
          <p className="text-sm text-muted-foreground">Annualized Return (XIRR)</p>
          <p className={`text-2xl font-bold ${xirrColorClass}`}>
            {xirrSignPrefix}
            {xirrPercent.toFixed(2)}% p.a.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Over {investmentDurationYears.toFixed(1)} years
          </p>
        </div>

        <div className="flex flex-col justify-center">
          <p className="text-sm text-muted-foreground">Effective Value</p>
          <p className="text-2xl font-bold text-app-orange">
            {formatCurrency(effectiveCurrentValue)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{effectiveValueLabel}</p>
        </div>
      </div>
    </div>
  )
}

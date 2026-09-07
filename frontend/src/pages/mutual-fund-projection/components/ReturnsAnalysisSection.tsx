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
  /** True once the user supplies a real market value, which is what makes the two rate tiles meaningful. */
  hasCurrentValueOverride: boolean
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
    hasCurrentValueOverride,
  } = props

  return (
    <section className="mt-6 border-t border-border pt-5" aria-labelledby="returns-analysis-title">
      <h3
        id="returns-analysis-title"
        className="mb-4 flex items-center gap-2 text-base font-semibold"
      >
        <BarChart3 className="size-5 text-app-orange" aria-hidden="true" />
        Returns Analysis
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            className="ledger-control min-h-11 w-full rounded-md border px-3 py-2.5 text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-10"
            min="0"
            step="1000"
          />
          <p className="text-xs text-muted-foreground mt-1">{currentValueLabel}</p>
        </div>

        {/* Both rate tiles need a market value. Without the override,
            effectiveCurrentValue falls back to the book balance -- the same
            contributions the denominator is built from -- so the "return" would
            be a rounding residue (+0.14% on the owner's real fund). Show the
            prompt instead of a number that looks measured and is not. */}
        {hasCurrentValueOverride ? (
          <div className="flex flex-col justify-center">
            <p className="text-sm text-muted-foreground">Total Return</p>
            <p
              className={`ledger-figure break-words text-2xl font-bold ${totalReturnColorClass}`}
              aria-live="polite"
              title={`${totalReturnSignPrefix}${overrideGainsPercent.toFixed(2)}%`}
            >
              {totalReturnSignPrefix}
              {overrideGainsPercent.toFixed(2)}%
            </p>
            <p className="ledger-figure mt-1 text-xs text-muted-foreground">
              {formatCurrency(overrideGains)} on {formatCurrency(totalHistoricalInvested)}
            </p>
          </div>
        ) : (
          <div className="flex flex-col justify-center">
            <p className="text-sm text-muted-foreground">Total Return</p>
            <p className="text-2xl font-bold text-text-quaternary">Not available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Enter a current value to compute
            </p>
          </div>
        )}

        {hasCurrentValueOverride ? (
          <div className="flex flex-col justify-center">
            <p className="text-sm text-muted-foreground">Annualized Return (XIRR)</p>
            <p
              className={`ledger-figure break-words text-2xl font-bold ${xirrColorClass}`}
              aria-live="polite"
              title={`${xirrSignPrefix}${xirrPercent.toFixed(2)}% p.a.`}
            >
              {xirrSignPrefix}
              {xirrPercent.toFixed(2)}% p.a.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Over{' '}
              <span className="ledger-figure">{investmentDurationYears.toFixed(1)}</span> years
            </p>
          </div>
        ) : (
          <div className="flex flex-col justify-center">
            <p className="text-sm text-muted-foreground">Annualized Return (XIRR)</p>
            <p className="text-2xl font-bold text-text-quaternary">Not available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Needs a current value, not just contributions
            </p>
          </div>
        )}

        <div className="flex flex-col justify-center">
          <p className="text-sm text-muted-foreground">Effective Value</p>
          <p
            className="ledger-figure break-words text-2xl font-bold text-app-orange"
            aria-live="polite"
          >
            {formatCurrency(effectiveCurrentValue)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{effectiveValueLabel}</p>
        </div>
      </div>
    </section>
  )
}

import type { FIREInputDefaults } from '@/lib/fireCalculator'
import { formatCurrencyShort } from '@/lib/formatters'

import { AGE_LIMITS } from '../monteCarloPlan'
import type { MonteCarloPlanState } from '../useMonteCarloPlan'
import AmountField from './AmountField'
import SliderInput from './SliderInput'

interface MonteCarloPlanInputsProps {
  readonly mc: MonteCarloPlanState
  readonly measured: FIREInputDefaults
}

const LEGEND = 'mb-3 text-sm font-semibold text-foreground'

/** Ages, yearly money at today's prices (entered in the base currency), and INR inflation. */
export default function MonteCarloPlanInputs({ mc, measured }: MonteCarloPlanInputsProps) {
  const { plan, setField } = mc
  const years = (value: number) => `${value} years`
  return (
    <div className="space-y-6">
      <fieldset className="min-w-0">
        <legend className={LEGEND}>Ages</legend>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
          <SliderInput id="mc-age" label="Your age today" value={plan.currentAge} min={AGE_LIMITS.min} max={AGE_LIMITS.maxCurrent} step={1} unit="" valueText={years(plan.currentAge)} onChange={(v) => setField('currentAge', v)} />
          <SliderInput id="mc-retire" label="Retire at age" value={plan.retireAge} min={plan.currentAge} max={AGE_LIMITS.maxRetire} step={1} unit="" valueText={years(plan.retireAge)} onChange={(v) => setField('retireAge', v)} />
          <SliderInput id="mc-end" label="Plan until age" value={plan.endAge} min={plan.retireAge + 1} max={AGE_LIMITS.maxEnd} step={1} unit="" valueText={years(plan.endAge)} onChange={(v) => setField('endAge', v)} />
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className={LEGEND}>Money each year, at today&apos;s prices</legend>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <AmountField
            id="mc-savings"
            label="Saved each year until you retire"
            value={plan.annualSavings}
            hint={measured.annualSavings > 0
              ? `measured ${formatCurrencyShort(measured.annualSavings)}`
              : `measured ${formatCurrencyShort(measured.annualSavings)}, so none is assumed`}
            onChange={(v) => setField('annualSavings', v)}
          />
          <AmountField
            id="mc-spending"
            label="Spent each year once retired"
            value={plan.annualSpending}
            hint={`measured ${formatCurrencyShort(measured.annualExpenses)}`}
            onChange={(v) => setField('annualSpending', v)}
          />
          <SliderInput id="mc-inflation" label="Average INR inflation" value={plan.inflationPct} min={2} max={12} step={0.5} unit="%" valueText={`${plan.inflationPct} percent`} onChange={(v) => setField('inflationPct', v)} />
          <SliderInput id="mc-inflation-sd" label="Inflation swing, one sd" value={plan.inflationVolatilityPct} min={0} max={5} step={0.5} unit="%" valueText={`${plan.inflationVolatilityPct} percent`} onChange={(v) => setField('inflationVolatilityPct', v)} />
        </div>
        <p className="mt-3 text-xs leading-5 text-text-tertiary">
          Savings and spending rise with each run&apos;s inflation, so they keep today&apos;s buying power.
          Measured figures annualise your recorded income and spending.
        </p>
      </fieldset>
    </div>
  )
}

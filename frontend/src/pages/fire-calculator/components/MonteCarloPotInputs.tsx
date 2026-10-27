import { FALLBACK_MIX } from '@/lib/finance/monteCarlo'
import { formatPercent } from '@/lib/formatters'

import { POT_COPY, POT_IDS } from '../monteCarloPlan'
import type { MonteCarloPlanState } from '../useMonteCarloPlan'
import AmountField from './AmountField'
import SliderInput from './SliderInput'

const FALLBACK_TEXT = POT_IDS
  .map((id) => `${formatPercent(FALLBACK_MIX[id] * 100, false, 0)} ${POT_COPY[id].label.toLowerCase()}`)
  .join(', ')

/** One card per pot: balance today, expected return and volatility, and its share of the yearly mix. */
export default function MonteCarloPotInputs({ mc }: Readonly<{ mc: MonteCarloPlanState }>) {
  const { plan, setPotField } = mc
  const total = POT_IDS.reduce((sum, id) => sum + plan.pots[id].balance, 0)
  const share = (id: (typeof POT_IDS)[number]) => (total > 0 ? plan.pots[id].balance / total : FALLBACK_MIX[id])
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {POT_IDS.map((id) => {
          const pot = plan.pots[id]
          return (
            <fieldset key={id} className="min-w-0 space-y-4 rounded-md border border-[var(--hairline-2)] p-3 sm:p-4">
              <legend className="px-1 text-sm font-semibold text-foreground">
                {POT_COPY[id].label}
                <span className="ml-2 font-mono text-xs font-normal tabular-nums text-text-tertiary">
                  {formatPercent(share(id) * 100, false, 0)} of mix
                </span>
              </legend>
              <p className="-mt-2 text-xs text-text-tertiary">{POT_COPY[id].holds}</p>
              <AmountField id={`mc-${id}-balance`} label="Balance today" value={pot.balance} onChange={(v) => setPotField(id, 'balance', v)} />
              <SliderInput
                id={`mc-${id}-return`}
                label="Expected return, yearly CAGR"
                value={pot.returnPct}
                min={0}
                max={20}
                step={0.5}
                unit="%"
                valueText={`${pot.returnPct} percent a year`}
                onChange={(v) => setPotField(id, 'returnPct', v)}
              />
              <SliderInput
                id={`mc-${id}-volatility`}
                label="Volatility, sd of yearly returns"
                value={pot.volatilityPct}
                min={0}
                max={40}
                step={1}
                unit="%"
                valueText={`${pot.volatilityPct} percent`}
                onChange={(v) => setPotField(id, 'volatilityPct', v)}
              />
            </fieldset>
          )
        })}
      </div>
      <p className="text-xs leading-5 text-text-tertiary">
        Pots start from your net worth (book value). Investment accounts mapped as PPF/EPF or fixed deposits in
        Settings count as debt; other investments count as equity. Every year the portfolio is rebalanced to this mix
        {total > 0 ? '' : ` (${FALLBACK_TEXT} while every pot is empty)`}.
        Defaults are rough INR long-run figures, not forecasts.
      </p>
    </div>
  )
}
